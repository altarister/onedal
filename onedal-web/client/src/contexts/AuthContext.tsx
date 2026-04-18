import React, { createContext, useContext, useState, useEffect } from "react";
import { apiClient } from "../api/apiClient";
import { socket } from "../lib/socket";

interface User {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    loginWithGoogle: (credential: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem("access_token");
            if (token) {
                const { data } = await apiClient.get("/auth/me");
                setUser(data.user);
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const loginWithGoogle = async (credential: string) => {
        try {
            const { data } = await apiClient.post("/auth/google", { credential });
            localStorage.setItem("access_token", data.accessToken);
            localStorage.setItem("refresh_token", data.refreshToken);
            setUser(data.user);
            socket.disconnect(); // 기존 연결 끊고
            socket.connect();    // 새 토큰으로 확실하게 재접속
        } catch (error) {
            console.error("Google Login failed:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            const refreshToken = localStorage.getItem("refresh_token");
            await apiClient.post("/auth/logout", { refreshToken });
        } catch (error) {
            console.error("Logout error", error);
        } finally {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            setUser(null);
            socket.disconnect(); // 로그아웃 시 소켓도 끊어주기
            window.location.href = "/login";
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            loginWithGoogle,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
