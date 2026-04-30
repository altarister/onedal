import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('onedal-ui-theme');
        return (savedTheme as Theme) || 'dark'; // 기본값은 dark 이지만, 1dal 클릭시 토글됨
    });

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('onedal-ui-theme', newTheme);
    };

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    useEffect(() => {
        const root = document.documentElement;
        // 기존 테마 클래스 제거
        root.classList.remove('light', 'dark', 'theme-light', 'theme-dark');
        // 신규 테마 클래스 추가
        root.classList.add(theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
