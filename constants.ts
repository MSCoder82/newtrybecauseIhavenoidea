import { KpiDataPoint, EntryType, NavItem, Campaign } from './types';
import {
  HomeIcon,
  TableCellsIcon,
  DocumentPlusIcon,
  ClipboardDocumentListIcon,
  MegaphoneIcon,
  TrophyIcon,
  GlobeAltIcon,
} from './components/Icons';

export const MOCK_CAMPAIGN_DATA: Campaign[] = [];

export const MOCK_KPI_DATA: KpiDataPoint[] = [];


export const NAVIGATION_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: HomeIcon, roles: ['chief', 'staff'] },
  { id: 'table', label: 'Data Explorer', icon: TableCellsIcon, roles: ['chief', 'staff'] },
  { id: 'data-entry', label: 'Add Entry', icon: DocumentPlusIcon, roles: ['chief', 'staff'] },
  { id: 'campaigns', label: 'Campaigns', icon: MegaphoneIcon, roles: ['chief'] },
  { id: 'goals', label: 'Set Goals', icon: TrophyIcon, roles: ['chief'] },
  { id: 'plan-builder', label: 'Plan Builder', icon: ClipboardDocumentListIcon, roles: ['chief'] },
  { id: 'social-media', label: 'Social Media', icon: GlobeAltIcon, roles: ['chief', 'staff'] },
];

export const ENTRY_TYPES = Object.values(EntryType);

export const METRIC_OPTIONS: Record<EntryType, string[]> = {
    [EntryType.OUTPUT]: [
      'News release', 
      'Media advisory', 
      'Media engagement (interviews/briefs)', 
      'Web article/Feature', 
      'DVIDS upload (photo/video)', 
      'Social posts (FB/X/IG/LI)', 
      'Infographic', 
      'Factsheet/One-pager', 
      'FAQ/Q&A', 
      'Video package/Reel/Short', 
      'Photo set', 
      'Public meeting/Open house', 
      'Stakeholder briefing deck', 
      'Talking points/Speech', 
      'Newsletter (internal/external)', 
      'Public notice', 
      'Blog post', 
      'Radio PSA/Podcast guest', 
      'Op-ed',
      'Email to distro/Workforce note', 
      'Congressional update',
      'Other',
    ],
    [EntryType.OUTCOME]: [
      'Awareness lift',
      'Understanding of issue/process',
      'Trust/credibility indicators',
      'Intent to participate/comply',
      'Permit/application completeness',
      'Public meeting civility/productivity',
      'Rumor reduction/Misinfo countered',
      'Safety behavior adoption (e.g., life jacket use)',
      'Preparedness actions taken',
      'Support for decisions/policies',
      'Stakeholder collaboration',
      'Other',
    ],
    [EntryType.OUTTAKE]: [
      'Reach/Impressions', 
      'Engagement rate', 
      'Reactions/Comments/Shares', 
      'Click-through rate', 
      'Video views', 
      'Average watch time', 
      'Web sessions', 
      'Time on page', 
      'Bounce rate', 
      'Media pickups', 
      'Share of voice', 
      'Earned sentiment', 
      'Event attendance', 
      'Questions received', 
      'Call/email volume', 
      'Newsletter',
      'Other',
    ],
};
