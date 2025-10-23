import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { KpiDataPoint, View, Role, Campaign, Profile, KpiGoal } from './types';
import { NAVIGATION_ITEMS } from './constants';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import KpiTable from './components/KpiTable';
import DataEntry from './components/DataEntry';
import PlanBuilder from './components/PlanBuilder';
import Campaigns from './components/Campaigns';
import GoalSetter from './components/GoalSetter';
import SocialMedia from './components/SocialMedia';
import Auth from './components/Auth';
import ProfilePage from './components/ProfilePage';
import { supabase } from './lib/supabase';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useTheme } from './contexts/ThemeProvider';
import { useNotification } from './contexts/NotificationProvider';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [kpiData, setKpiData] = useState<KpiDataPoint[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useNotification();

  const handleSetActiveView = useCallback((view: View) => {
    setActiveView(view);
    setIsSidebarOpen(false);
  }, []);

  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarClose = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);


  const fetchKpiData = useCallback(async () => {
    const { data, error } = await supabase.from('kpi_data').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Error fetching KPI data:', error);
      showToast('Error fetching KPI data.', 'error');
    } else {
      setKpiData(data as KpiDataPoint[]);
    }
  }, [showToast]);

  const fetchCampaigns = useCallback(async () => {
    const { data, error } = await supabase.from('campaigns').select('*').order('start_date', { ascending: false });
    if (error) {
      console.error('Error fetching campaigns:', error);
      showToast('Error fetching campaigns.', 'error');
    } else {
      setCampaigns(data as Campaign[]);
    }
  }, [showToast]);

  const fetchGoals = useCallback(async () => {
    const { data, error } = await supabase.from('kpi_goals').select('*').order('start_date', { ascending: false });
    if (error) {
        console.error('Error fetching KPI goals:', error);
        showToast('Error fetching KPI goals.', 'error');
    } else {
        setGoals(data as KpiGoal[]);
    }
  }, [showToast]);

  useEffect(() => {
    // Central auth lifecycle handler: initial load, login, logout, refresh.
    let isMounted = true;
    let initTimeout: number | null = null;
    let gotInitialEvent = false;
    let bootstrapped = false;

    const handleSession = async (session: Session | null, options: { fetchData?: boolean } = {}) => {
      if (!isMounted) {
        return;
      }

      setSession(session);
      lastUserIdRef.current = session?.user?.id ?? null;

      if (!session) {
        setProfile(null);
        setKpiData([]);
        setCampaigns([]);
        setGoals([]);
        return;
      }

      if (options.fetchData === false) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role, avatar_url, teams (id, name)')
          .eq('id', session.user.id)
          .single();

        if (!isMounted) {
          return;
        }

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data) {
          setProfile({
            role: (data.role as Role) || 'staff',
            teamId: data.teams?.id ?? -1,
            teamName: data.teams?.name ?? 'No Team',
            avatarUrl: data.avatar_url,
          });
        } else {
          setProfile({ role: 'staff', teamId: -1, teamName: 'Unknown Team' });
        }

        // Fetch data after session and profile are confirmed
        await Promise.all([fetchKpiData(), fetchCampaigns(), fetchGoals()]);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const typedError = error as { message?: string; code?: string };
        console.error(
          `Error fetching user profile: ${typedError.message || 'An unknown error occurred'}. Code: ${typedError.code || 'N/A'}`
        );
        if (typedError.code === '42P01') {
          showToast('Database error: A required table is missing. Run the setup SQL.', 'error');
        } else {
          showToast('Error fetching user profile.', 'error');
        }
        setProfile({ role: 'staff', teamId: -1, teamName: 'Error' });
      }
    };

    const fallbackInit = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await handleSession(data?.session ?? null);
      } catch (e) {
        console.error('Fallback session init failed:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Start in a loading state and use both immediate getSession and the auth listener (first wins)
    setIsLoading(true);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted || bootstrapped) return;
        await handleSession(data?.session ?? null);
      } catch (e) {
        console.error('Immediate session init failed:', e);
      } finally {
        if (isMounted && !bootstrapped) {
          setIsLoading(false);
          bootstrapped = true;
        }
      }
    })();
    // Safety: ensure we never get stuck showing the spinner
    if (typeof window !== 'undefined') {
      initTimeout = window.setTimeout(() => {
        if (isMounted && !gotInitialEvent) {
          void fallbackInit();
        }
      }, 5000);
    }

    const handledEvents: AuthChangeEvent[] = ['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'];
    const silentEvents: AuthChangeEvent[] = ['TOKEN_REFRESHED'];

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) {
        return;
      }

      gotInitialEvent = true;
      const sameUser = session?.user?.id && session.user.id === lastUserIdRef.current;

      // Silent updates shouldn't toggle the global loading spinner
      // Only treat TOKEN_REFRESHED and same-user USER_UPDATED as silent.
      // SIGNED_IN must not be silent (even if same user), so we fetch profile/data.
      if (silentEvents.includes(event) || (sameUser && event === 'USER_UPDATED')) {
        try {
          await handleSession(session, { fetchData: false });
        } catch (e) {
          console.error('Error handling silent auth event:', e);
        }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        try {
          await handleSession(session ?? null);
        } catch (e) {
          console.error('Unhandled error during initial session handling:', e);
        } finally {
          if (initTimeout) {
            clearTimeout(initTimeout);
            initTimeout = null;
          }
          if (isMounted && !bootstrapped) {
            setIsLoading(false);
            bootstrapped = true;
          }
        }
        return;
      }

      if (!handledEvents.includes(event)) {
        return;
      }

      setIsLoading(true);
      try {
        await handleSession(session ?? null);
      } catch (e) {
        console.error('Unhandled error during auth state change handling:', e);
        try {
          showToast('Authentication changed. Please refresh or sign in again.', 'error');
        } catch {}
      } finally {
        if (isMounted) {
          setIsLoading(false);
          bootstrapped = true;
        }
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isMounted && (isLoading || !session || !profile)) {
          setIsLoading(true);
          void fallbackInit();
        }
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      isMounted = false;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      subscription.unsubscribe();
    };
  }, [fetchKpiData, fetchCampaigns, fetchGoals, showToast]);


  const addKpiDataPoint = useCallback(async (newDataPoint: Omit<KpiDataPoint, 'id'>) => {
    if (!session?.user) {
        showToast("No user session found. Cannot add KPI data.", 'error');
        return;
    }
    // team_id will be set by a database trigger based on the user's profile
    const { error } = await supabase.from('kpi_data').insert([
      { ...newDataPoint, user_id: session.user.id }
    ]);
    if (error) {
      console.error('Error inserting KPI data:', error);
      showToast(`Error: ${error.message}`, 'error');
    } else {
      await fetchKpiData(); // Refetch data
      handleSetActiveView('table'); // Switch to table view
      showToast("KPI entry successfully added!", 'success');
    }
  }, [session, fetchKpiData, showToast, handleSetActiveView]);

  const addCampaign = useCallback(async (newCampaign: Omit<Campaign, 'id'>) => {
    if (!session?.user) {
        showToast("No user session found. Cannot add campaign.", 'error');
        return;
    }
    // team_id will be set by a database trigger based on the user's profile
    const { error } = await supabase.from('campaigns').insert([
        { ...newCampaign, user_id: session.user.id }
    ]);

    if (error) {
        console.error('Error inserting campaign:', error);
        showToast(`Error: ${error.message}`, 'error');
    } else {
        await fetchCampaigns(); // Refetch campaigns
        showToast("Campaign created successfully!", 'success');
    }
  }, [session, fetchCampaigns, showToast]);

  const addGoal = useCallback(async (newGoal: Omit<KpiGoal, 'id'>) => {
    if (!session?.user) {
        showToast("No user session found. Cannot add goal.", 'error');
        return;
    }
    const { error } = await supabase.from('kpi_goals').insert([
        { ...newGoal, user_id: session.user.id }
    ]);

    if (error) {
        console.error('Error inserting KPI goal:', error);
        showToast(`Error: ${error.message}`, 'error');
    } else {
        await fetchGoals();
        showToast("Goal created successfully!", 'success');
    }
  }, [session, fetchGoals, showToast]);

  const onProfileUpdate = (updatedProfileData: Partial<Profile>) => {
    setProfile(prevProfile => {
        if (!prevProfile) return null;
        return { ...prevProfile, ...updatedProfileData };
    });
    showToast('Profile updated successfully!', 'success');
  };
  
  const visibleNavItems = useMemo(() => {
    if (!profile) return [];
    return NAVIGATION_ITEMS.filter(item => item.roles.includes(profile.role));
  }, [profile]);

  const isViewAllowed = useCallback((view: View) => {
    if (!profile) return false;
    if (view === 'profile') return true; // Any authenticated user can see their own profile
    const item = NAVIGATION_ITEMS.find(navItem => navItem.id === view);
    return item ? item.roles.includes(profile.role) : false;
  }, [profile]);
  
  useEffect(() => {
    if (profile && !isViewAllowed(activeView)) {
      handleSetActiveView('dashboard');
    }
  }, [profile, activeView, isViewAllowed, handleSetActiveView]);

  const renderActiveView = () => {
    if (!profile || !isViewAllowed(activeView)) {
      // Default to dashboard if current view is not allowed
      return <Dashboard data={kpiData} campaigns={campaigns} goals={goals} />;
    }

    switch (activeView) {
      case 'dashboard':
        return <Dashboard data={kpiData} campaigns={campaigns} goals={goals} />;
      case 'table':
        return <KpiTable data={kpiData} />;
      case 'data-entry':
        return <DataEntry onSubmit={addKpiDataPoint} campaigns={campaigns} />;
      case 'plan-builder':
        return <PlanBuilder />;
      case 'campaigns':
        return <Campaigns campaigns={campaigns} onAddCampaign={addCampaign} />;
      case 'goals':
        return <GoalSetter goals={goals} onAddGoal={addGoal} campaigns={campaigns} />;
      case 'social-media':
        return <SocialMedia role={profile.role} campaigns={campaigns} teamId={profile.teamId} />;
      case 'profile':
        return <ProfilePage session={session!} profile={profile} onProfileUpdate={onProfileUpdate} />;
      default:
        return <Dashboard data={kpiData} campaigns={campaigns} goals={goals} />;
    }
  };

  if (isLoading) {
    return <Spinner />;
  }

  // If there is no session, show Auth
  if (!session) {
    return <Auth />;
  }

  // If session exists but profile hasn't been resolved yet, keep showing a spinner
  if (!profile) {
    return <Spinner />;
  }

  return (
    <div className="flex min-h-screen bg-navy-50 font-sans text-navy-900 dark:bg-navy-950 dark:text-navy-100">
      <Sidebar
        navigationItems={visibleNavItems}
        activeView={activeView}
        setActiveView={handleSetActiveView}
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
      />
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={handleSidebarClose}
          aria-hidden="true"
        />
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          session={session}
          profile={profile}
          theme={theme}
          toggleTheme={toggleTheme}
          setActiveView={handleSetActiveView}
          onMenuToggle={handleSidebarToggle}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-8">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};

export default App;
