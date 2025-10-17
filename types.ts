import React from 'react';

export enum EntryType {
  OUTPUT = 'Output',
  OUTTAKE = 'Outtake',
  OUTCOME = 'Outcome',
}

export interface Team {
  id: number;
  name: string;
}

export interface KpiDataPoint {
  id: number;
  date: string; // ISO 8601 format: "YYYY-MM-DD"
  type: EntryType;
  metric: string;
  quantity: number;
  notes?: string;
  campaign_id?: number;
  link?: string;
}

export interface Campaign {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
}

export interface KpiGoal {
  id: number;
  metric: string;
  target_value: number;
  start_date: string;
  end_date: string;
  campaign_id?: number;
}

export type View =
  | 'dashboard'
  | 'table'
  | 'data-entry'
  | 'plan-builder'
  | 'campaigns'
  | 'profile'
  | 'goals'
  | 'social-media';

export type Role = 'chief' | 'staff';

export interface Profile {
    role: Role;
    teamId: number;
    teamName: string;
    avatarUrl?: string;
}

// Fix: Changed icon type to React.ComponentType to resolve "Cannot find namespace 'JSX'" error. This requires importing React.
export interface NavItem {
  id: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}