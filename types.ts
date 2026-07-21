
export type BlogStatus = 'draft' | 'published';

export interface BlogPost {
  id: string;
  author_id: string;
  author_username?: string;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  cover_image_url?: string;
  youtube_video_url?: string;
  status: BlogStatus;
  is_featured: boolean;
  required_clearance_level: number;
  tags: string[];
  views: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export enum RoadmapStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  status?: RoadmapStatus;
  category?: string;
  progress?: number;
  comments?: number;
  dueDate?: string;
  // properties from config.json
  type?: string;
  priority?: string;
  column?: string;
}

export interface RoadmapColumn {
  id: string;
  title: string;
  color: string;
}

export interface FeedbackSection {
  enabled: boolean;
  title: string;
  subtitle: string;
  formspreeUrl: string;
  successMessage: string;
}

export interface RoadmapSection {
  enabled: boolean;
  title: string;
  subtitle: string;
  columns: RoadmapColumn[];
  items: RoadmapItem[];
}

export interface InfoBanner {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  message: string;
  icon: string;
  style: string;
}


export interface CountdownConfig {
  enabled: boolean;
  date: string;
  title: string;
}

export interface SiteInfo {
  title: string;
  description: string;
}

export interface Config {
  siteInfo: SiteInfo;
  countdown: CountdownConfig;
  isEmergencyEnabled: boolean;
  isTerminalEnabled: boolean;
  isIntelEnabled: boolean;
  socials?: {
    discord?: string;
  };
  github: {
    repository: string;
    token?: string;
  };
  infoBanners: InfoBanner[];
  checkIframeServer: boolean;
  feedbackRoadmap: {
    enabled: boolean;
    sections: {
      feedback: FeedbackSection;
      suggestions: FeedbackSection;
      roadmap: RoadmapSection;
    };
  };
  serverMetadata: {
    ip: string;
    modpackVersion: string;
  };
  serverProvider?: 'mcss' | 'pterodactyl';
  mcss?: {
    enabled: boolean;
    defaultBaseUrl?: string;
    masterStandardKey?: string;
    masterAdminKey?: string;
  };
  pterodactyl?: {
    enabled: boolean;
    defaultBaseUrl?: string;
    masterStandardKey?: string;
    masterAdminKey?: string;
  };
  isBlogEnabled: boolean;
  blogTitle: string;
  blogSubtitle: string;
  // Fallback / legacy support (optional)
  serverIp?: string;
  modpackVersion?: string;
  targetDate?: string;
  githubRepo?: string;
}
