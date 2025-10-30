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
  const handleSessionRef = useRef<
    (session: Session | null, options?: { fetchData?: boolean }) => Promise<void>
  >();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const loadingSinceRef = useRef<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const sessionRestoreRef = useRef(false);
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

    const beginLoading = () => {
      if (!isMounted) {
        return;
      }
      setIsLoading(true);
      loadingSinceRef.current = Date.now();
    };

    const finishLoading = () => {
      if (!isMounted) {
        return;
      }
      setIsLoading(false);
      loadingSinceRef.current = null;
    };

    const handleSession = async (session: Session | null, options: { fetchData?: boolean } = {}) => {
      if (!isMounted) {
        return;
      }

      const previousUserId = lastUserIdRef.current;
      setSession(session);
      sessionRef.current = session;
      lastUserIdRef.current = session?.user?.id ?? null;

      if (!session) {
        setProfile(null);
        profileRef.current = null;
        setKpiData([]);
        setCampaigns([]);
        setGoals([]);
        return;
      }

      const sameUser = Boolean(session.user?.id && session.user.id === previousUserId);
      const hasCachedProfile = Boolean(profileRef.current && sameUser);
      if (options.fetchData === false && hasCachedProfile) {
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

        const nextProfile: Profile =
          data
            ? {
                role: (data.role as Role) || 'staff',
                teamId: data.teams?.id ?? -1,
                teamName: data.teams?.name ?? 'No Team',
                avatarUrl: data.avatar_url,
              }
            : { role: 'staff', teamId: -1, teamName: 'Unknown Team' };

        setProfile(nextProfile);
        profileRef.current = nextProfile;

        // Refresh dashboard data asynchronously; loading spinner should not block on these calls.
        void (async () => {
          try {
            await Promise.all([fetchKpiData(), fetchCampaigns(), fetchGoals()]);
          } catch (dashboardError) {
            console.error('Error refreshing dashboard data after session change:', dashboardError);
          }
        })();
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
        const fallbackProfile: Profile = { role: 'staff', teamId: -1, teamName: 'Error' };
        setProfile(fallbackProfile);
        profileRef.current = fallbackProfile;
      }
    };
    handleSessionRef.current = handleSession;

    const fallbackInit = async () => {
      if (sessionRestoreRef.current) {
        return;
      }
      sessionRestoreRef.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        await handleSession(data?.session ?? null);
      } catch (e) {
        console.error('Fallback session init failed:', e);
      } finally {
        finishLoading();
      }
      sessionRestoreRef.current = false;
    };

    // Start in a loading state and use both immediate getSession and the auth listener (first wins)
    beginLoading();
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted || bootstrapped) return;
        await handleSession(data?.session ?? null);
      } catch (e) {
        console.error('Immediate session init failed:', e);
      } finally {
        if (isMounted && !bootstrapped) {
          finishLoading();
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
            finishLoading();
            bootstrapped = true;
          }
        }
        return;
      }

      if (!handledEvents.includes(event)) {
        return;
      }

      beginLoading();
      try {
        await handleSession(session ?? null);
      } catch (e) {
        console.error('Unhandled error during auth state change handling:', e);
        try {
          showToast('Authentication changed. Please refresh or sign in again.', 'error');
        } catch {}
      } finally {
        if (isMounted) {
          finishLoading();
          bootstrapped = true;
        }
      }
    });

    const refreshSessionSilently = async () => {
      if (sessionRestoreRef.current) {
        return;
      }
      sessionRestoreRef.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (handleSessionRef.current) {
          await handleSessionRef.current(data?.session ?? null, { fetchData: false });
        }
      } catch (error) {
        console.error('Silent session refresh failed:', error);
      } finally {
        sessionRestoreRef.current = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !isMounted) {
        return;
      }

      if (!sessionRef.current || !profileRef.current) {
        void fallbackInit();
        return;
      }

      void refreshSessionSilently();
    };

    const onFocus = () => {
      if (!isMounted) {
        return;
      }

      if (!sessionRef.current || !profileRef.current) {
        void fallbackInit();
        return;
      }

      void refreshSessionSilently();
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', onFocus);
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
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [fetchKpiData, fetchCampaigns, fetchGoals, showToast]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;

    const watchdog = window.setTimeout(() => {
      const startedAt = loadingSinceRef.current;
      if (!startedAt) {
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < 8000) {
        return;
      }

      console.warn(
        `Global loading spinner active for ${elapsed}ms; attempting emergency session refresh.`,
      );

      const refreshSession = async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (handleSessionRef.current) {
            await handleSessionRef.current(data?.session ?? null);
          }
        } catch (error) {
          console.error('Emergency session refresh failed:', error);
        } finally {
          if (!cancelled) {
            setIsLoading(false);
            loadingSinceRef.current = null;
          }
        }
      };

      void refreshSession();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [isLoading]);


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
        const nextProfile = { ...prevProfile, ...updatedProfileData };
        profileRef.current = nextProfile;
        return nextProfile;
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
