import axios from "axios";

// Vite 프록시를 사용할 경우, 서버가 http://localhost:4000/ 이라면 상대경로 /api를 사용합니다.
// (또는 VITE_API_URL 환경 변수 사용 가능)
const baseURL = import.meta.env.VITE_API_URL || "/api";

export const apiClient = axios.create({
    baseURL,
    headers: {
        "Content-Type": "application/json"
    }
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("access_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh automatically
let isRefreshing = false;
let refreshSubscribers: { resolve: (token: string) => void, reject: (err: any) => void }[] = [];

function onRefreshed(token: string) {
    refreshSubscribers.forEach((cb) => cb.resolve(token));
    refreshSubscribers = [];
}

function onRefreshFailed(err: any) {
    refreshSubscribers.forEach((cb) => cb.reject(err));
    refreshSubscribers = [];
}

function subscribeTokenRefresh(resolve: (token: string) => void, reject: (err: any) => void) {
    refreshSubscribers.push({ resolve, reject });
}

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        // If error is 401 and it's not a retry already
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const refreshToken = localStorage.getItem("refresh_token");
                    if (!refreshToken) throw new Error("No refresh token at all.");

                    // Note: use simple axios instead of apiClient to avoid loop
                    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: refreshToken });
                    
                    localStorage.setItem("access_token", data.accessToken);
                    if (data.refreshToken) {
                        localStorage.setItem("refresh_token", data.refreshToken);
                    }
                    
                    apiClient.defaults.headers.common["Authorization"] = `Bearer ${data.accessToken}`;
                    onRefreshed(data.accessToken);
                    
                    // retry original request with new token
                    originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
                    return apiClient(originalRequest);
                } catch (refreshErr) {
                    console.error("Token refresh failed:", refreshErr);
                    onRefreshFailed(refreshErr);
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("refresh_token");
                    window.location.href = "/login";
                    return Promise.reject(refreshErr);
                } finally {
                    isRefreshing = false;
                }
            } else {
                // Wait until the current active token request resolves
                return new Promise((resolve, reject) => {
                    subscribeTokenRefresh(
                        (token) => {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            resolve(apiClient(originalRequest));
                        },
                        (err) => {
                            reject(err);
                        }
                    );
                });
            }
        }
        
        return Promise.reject(error);
    }
);
