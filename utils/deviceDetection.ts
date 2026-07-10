import { Capacitor } from '@capacitor/core';

// Capacitor global check
declare global {
    interface Window {
        Capacitor?: any;
    }
}

export const isNativeApp = (): boolean => {
    return Capacitor.isNativePlatform();
};

export const isAndroidApp = (): boolean => {
    return isNativeApp() && Capacitor.getPlatform() === 'android';
};

export const isMobilePhone = (): boolean => {
    if (typeof window === 'undefined') return false;

    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua) ||
        (ua.includes('Mac') && 'ontouchend' in document);

    return isMobile && !isTablet;
};

export const shouldRedirectToMobile = (): boolean => {
    // Check if already on mobile or app route
    if (window.location.hash.includes('/mobile') || window.location.hash.includes('/app')) return false;

    // Check localStorage to respect user preference
    const preference = localStorage.getItem('viewMode');
    if (preference === 'desktop') return false;

    return isMobilePhone() || isNativeApp();
};

// Reset function to clear desktop preference
export const resetViewMode = (): void => {
    localStorage.removeItem('viewMode');
};

export const switchToDesktop = (): void => {
    localStorage.setItem('viewMode', 'desktop');
    window.location.hash = '#/';
    window.location.reload();
};

export const switchToMobile = (): void => {
    localStorage.removeItem('viewMode');
    window.location.hash = '#/mobile';
    window.location.reload();
};
