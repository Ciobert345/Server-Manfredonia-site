
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Config, RoadmapItem, InfoBanner } from '../types';
import { supabase } from '../services/supabase';

const DEBUG_CONFIG = false;
const debugLog = (...args: any[]) => {
    if (DEBUG_CONFIG) console.log('[ConfigContext]', ...args);
};

export type LoadStatus = 'IDLE' | 'CACHE' | 'FETCHING' | 'REALTIME' | 'TIMEOUT' | 'READY' | 'ERROR';

interface ConfigContextType {
    config: Config | null;
    isDashboardGloballyEnabled: boolean;
    updateDashboardStatus: (enabled: boolean) => Promise<void>;
    updateGlobalConfig: (updates: any) => Promise<void>;
    updateMcssMasterKey: (id: 'standard' | 'admin', key: string) => Promise<void>;
    updatePterodactylMasterKey: (id: 'standard' | 'admin', key: string) => Promise<void>;
    updateServerProvider: (provider: 'mcss' | 'pterodactyl') => Promise<void>;
    notifications: InfoBanner[];
    roadmapItems: RoadmapItem[];
    loading: boolean;
    loadStatus: LoadStatus;
    error: string | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (!context) {
        console.error('[ConfigContext] useConfig used outside of ConfigProvider!');
    }
    return context!;
};

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<Config | null>(null);
    const [isDashboardGloballyEnabled, setIsDashboardGloballyEnabled] = useState(true);
    const [notifications, setNotifications] = useState<InfoBanner[]>([]);
    const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadStatus, setLoadStatus] = useState<LoadStatus>('IDLE');
    const [error, setError] = useState<string | null>(null);

    const isMounted = useRef(true);
    const hasFinishedInitialLoad = useRef(false);

    debugLog(`Rendering Provider - Status: ${loadStatus}, Loading: ${loading}`);

    const mapDbToConfig = (db: any, roadmap: RoadmapItem[]): Config => {
        return {
            siteInfo: { title: db.site_title || 'Server Manfredonia', description: db.site_description || '' },
            serverMetadata: { ip: db.server_ip || 'server-manfredonia.ddns.net', modpackVersion: db.modpack_version || 'v1.0' },
            github: { repository: db.github_repository || 'Ciobert345/Mod-server-Manfredonia' },
            countdown: { enabled: db.countdown_enabled || false, date: db.countdown_date || '', title: db.countdown_title || 'Upcoming Update' },
            isEmergencyEnabled: db.is_emergency_enabled ?? false,
            isTerminalEnabled: db.is_terminal_enabled ?? true,
            isIntelEnabled: db.is_intel_enabled ?? true,
            infoBanners: [],
            checkIframeServer: true,
            socials: { discord: db.discord_url },
            feedbackRoadmap: {
                enabled: db.roadmap_enabled || true,
                sections: {
                    feedback: { enabled: true, title: db.feedback_title || 'Report a Problem', subtitle: db.feedback_subtitle || 'Help us improve', formspreeUrl: db.feedback_form_url || '', successMessage: 'Success!' },
                    suggestions: { enabled: true, title: db.suggestions_title || 'Suggestions', subtitle: db.suggestions_subtitle || 'Help us improve', formspreeUrl: db.suggestions_form_url || '', successMessage: 'Success!' },
                    roadmap: {
                        enabled: db.roadmap_enabled || true,
                        title: db.roadmap_title || 'Roadmap',
                        subtitle: db.roadmap_subtitle || '',
                        columns: [{ id: 'backlog', title: 'Backlog', color: '#6c757d' }, { id: 'nextup', title: 'Next Up', color: '#007bff' }, { id: 'inprogress', title: 'In Progress', color: '#ffc107' }, { id: 'done', title: 'Done', color: '#28a745' }],
                        items: roadmap
                    }
                }
            },
            serverProvider: db.server_provider || 'mcss',
            mcss: {
                enabled: db.is_dashboard_enabled ?? true,
                defaultBaseUrl: db.mcss_api_url || 'https://server-manfredonia.ddns.net:25560',
                masterStandardKey: db.masterStandardKey || '',
                masterAdminKey: db.masterAdminKey || ''
            },
            pterodactyl: {
                enabled: db.is_dashboard_enabled ?? true,
                defaultBaseUrl: db.pterodactyl_api_url || 'https://panel.example.com',
                masterStandardKey: db.pterodactylMasterStandardKey || '',
                masterAdminKey: db.pterodactylMasterAdminKey || ''
            },
            isBlogEnabled: db.blog_enabled ?? false,
            blogTitle: db.blog_title || 'Blog',
            blogSubtitle: db.blog_subtitle || ''
        };
    };

    const finishLoading = (status: LoadStatus = 'READY') => {
        if (!isMounted.current) return;

        if (!hasFinishedInitialLoad.current) {
            hasFinishedInitialLoad.current = true;
            setLoadStatus(status);
            setLoading(false);
            debugLog(`Finalizing: ${status}`);
        }
    };

    const fetchAllData = async () => {
        try {
            setLoadStatus('FETCHING');
            debugLog('Fetching data from Supabase...');
            const [noteData, roadData, configResult] = await Promise.all([
                supabase.from('notifications').select('*').order('created_at', { ascending: false }),
                supabase.from('roadmap_items').select('*').order('created_at', { ascending: true }),
                supabase.from('global_config').select('*').eq('id', 1).single()
            ]);

            if (!isMounted.current) return;

            if (noteData.data) setNotifications(noteData.data);
            if (roadData.data) setRoadmapItems(roadData.data);

            if (configResult.data) {
                setIsDashboardGloballyEnabled(configResult.data.is_dashboard_enabled);
                const [mcssRes, pteroRes] = await Promise.all([
                    supabase.from('mcss_configs').select('id, mcss_api_key').in('id', ['standard', 'admin']),
                    supabase.from('pterodactyl_configs').select('id, pterodactyl_api_key').in('id', ['standard', 'admin']).then(res => res, () => ({ data: null }))
                ]);
                const masterStandardKey = mcssRes.data?.find(kv => kv.id === 'standard')?.mcss_api_key || '';
                const masterAdminKey = mcssRes.data?.find(kv => kv.id === 'admin')?.mcss_api_key || '';

                const pterodactylMasterStandardKey = pteroRes.data?.find(kv => kv.id === 'standard')?.pterodactyl_api_key || '';
                const pterodactylMasterAdminKey = pteroRes.data?.find(kv => kv.id === 'admin')?.pterodactyl_api_key || '';

                const newConfig = mapDbToConfig({
                    ...configResult.data,
                    masterStandardKey,
                    masterAdminKey,
                    pterodactylMasterStandardKey,
                    pterodactylMasterAdminKey
                }, roadData.data || []);
                setConfig(newConfig);
                localStorage.setItem('manfredonia_config_cache', JSON.stringify(newConfig));
                finishLoading('READY');
            } else if (configResult.error) {
                setError(configResult.error.message);
                finishLoading('ERROR');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            finishLoading('ERROR');
        }
    };

    const updateDashboardStatus = async (enabled: boolean) => {
        setIsDashboardGloballyEnabled(enabled);
        await supabase.from('global_config').update({ is_dashboard_enabled: enabled }).eq('id', 1);
    };

    const updateServerProvider = async (provider: 'mcss' | 'pterodactyl') => {
        await supabase.from('global_config').update({ server_provider: provider }).eq('id', 1);
        setConfig(prev => prev ? { ...prev, serverProvider: provider } : prev);
    };

    const updateGlobalConfig = async (updates: any) => {
        await supabase.from('global_config').update(updates).eq('id', 1);
        setConfig(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                isTerminalEnabled: Object.prototype.hasOwnProperty.call(updates, 'is_terminal_enabled') ? updates.is_terminal_enabled : prev.isTerminalEnabled,
                isEmergencyEnabled: Object.prototype.hasOwnProperty.call(updates, 'is_emergency_enabled') ? updates.is_emergency_enabled : prev.isEmergencyEnabled,
                isIntelEnabled: Object.prototype.hasOwnProperty.call(updates, 'is_intel_enabled') ? updates.is_intel_enabled : prev.isIntelEnabled,
                serverProvider: Object.prototype.hasOwnProperty.call(updates, 'server_provider') ? updates.server_provider : prev.serverProvider,
                siteInfo: {
                    title: Object.prototype.hasOwnProperty.call(updates, 'site_title') ? updates.site_title : prev.siteInfo.title,
                    description: Object.prototype.hasOwnProperty.call(updates, 'site_description') ? updates.site_description : prev.siteInfo.description
                },
                serverMetadata: {
                    ip: Object.prototype.hasOwnProperty.call(updates, 'server_ip') ? updates.server_ip : prev.serverMetadata.ip,
                    modpackVersion: Object.prototype.hasOwnProperty.call(updates, 'modpack_version') ? updates.modpack_version : prev.serverMetadata.modpackVersion
                },
                github: {
                    repository: Object.prototype.hasOwnProperty.call(updates, 'github_repository') ? updates.github_repository : prev.github.repository
                },
                mcss: {
                    ...prev.mcss,
                    enabled: prev.mcss?.enabled ?? true,
                    defaultBaseUrl: Object.prototype.hasOwnProperty.call(updates, 'mcss_api_url') ? updates.mcss_api_url : prev.mcss?.defaultBaseUrl
                },
                pterodactyl: {
                    ...prev.pterodactyl,
                    enabled: prev.pterodactyl?.enabled ?? true,
                    defaultBaseUrl: Object.prototype.hasOwnProperty.call(updates, 'pterodactyl_api_url') ? updates.pterodactyl_api_url : prev.pterodactyl?.defaultBaseUrl
                },
                isBlogEnabled: Object.prototype.hasOwnProperty.call(updates, 'blog_enabled') ? updates.blog_enabled : prev.isBlogEnabled,
                blogTitle: Object.prototype.hasOwnProperty.call(updates, 'blog_title') ? updates.blog_title : prev.blogTitle,
                blogSubtitle: Object.prototype.hasOwnProperty.call(updates, 'blog_subtitle') ? updates.blog_subtitle : prev.blogSubtitle,
            };
        });
        if (Object.prototype.hasOwnProperty.call(updates, 'is_dashboard_enabled')) {
            setIsDashboardGloballyEnabled(updates.is_dashboard_enabled);
        }
    };

    const updateMcssMasterKey = async (id: 'standard' | 'admin', key: string) => {
        await supabase.from('mcss_configs').upsert({ id, mcss_api_key: key });
        setConfig(prev => {
            if (!prev || !prev.mcss) return prev;
            return {
                ...prev,
                mcss: {
                    ...prev.mcss,
                    masterStandardKey: id === 'standard' ? key : prev.mcss.masterStandardKey,
                    masterAdminKey: id === 'admin' ? key : prev.mcss.masterAdminKey
                }
            };
        });
    };

    const updatePterodactylMasterKey = async (id: 'standard' | 'admin', key: string) => {
        await supabase.from('pterodactyl_configs').upsert({ id, pterodactyl_api_key: key });
        setConfig(prev => {
            if (!prev || !prev.pterodactyl) return prev;
            return {
                ...prev,
                pterodactyl: {
                    ...prev.pterodactyl,
                    masterStandardKey: id === 'standard' ? key : prev.pterodactyl.masterStandardKey,
                    masterAdminKey: id === 'admin' ? key : prev.pterodactyl.masterAdminKey
                }
            };
        });
    };

    useEffect(() => {
        isMounted.current = true;

        const cached = localStorage.getItem('manfredonia_config_cache');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setConfig(parsed);
                setRoadmapItems(parsed.feedbackRoadmap.sections.roadmap.items || []);
                setLoadStatus('CACHE');
            } catch (e) {
                console.warn('Cache parse failed');
            }
        }

        // AGGRESSIVE SAFETY TIMEOUT: Force-enable dashboard even if Supabase/Netlify is slow
        const safetyTimeout = setTimeout(() => {
            if (!hasFinishedInitialLoad.current) {
                console.warn('⚠ CONFIG: Aggressive safety timeout triggered (6s)');
                finishLoading('TIMEOUT');
            }
        }, 6000);

        fetchAllData();

        return () => {
            isMounted.current = false;
            clearTimeout(safetyTimeout);
        };
    }, []);

    return (
        <ConfigContext.Provider value={{
            config, isDashboardGloballyEnabled, updateDashboardStatus, updateGlobalConfig,
            updateMcssMasterKey, updatePterodactylMasterKey, updateServerProvider, notifications, roadmapItems, loading, loadStatus, error
        }}>
            {children}
        </ConfigContext.Provider>
    );
};
