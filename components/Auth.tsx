import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UsaceLogoIcon, CheckCircleIcon, XCircleIcon } from './Icons';
import { Team } from '../types';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  useEffect(() => {
    if (mode === 'signUp') {
      const fetchTeams = async () => {
        const { data, error } = await supabase.from('teams').select('id, name');
        if (error) {
          console.error('Error fetching teams:', error);
          setIsError(true);
          if (error.code === '42P01') {
            setMessage('Database setup incomplete. The "teams" table is missing. Please run the required SQL setup script.');
          } else {
            setMessage('Could not load teams for registration.');
          }
        } else {
          setTeams(data);
          if (data.length > 0) {
            setSelectedTeamId(String(data[0].id));
          }
        }
      };
      fetchTeams();
    }
  }, [mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: any) {
      setIsError(true);
      setMessage(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);
    
    if (!selectedTeamId) {
      setIsError(true);
      setMessage('Please select a team to join.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            team_id: parseInt(selectedTeamId, 10),
          },
        },
      });
      if (error) throw error;
      
      setIsError(false);
      setMessage('Registration successful! Please check your email to confirm your account.');
    } catch (error: any) {
      setIsError(true);
       if (error.message === 'Database error saving new user') {
         setMessage('An internal database error occurred during signup. This is often caused by an incomplete database setup. Please run the latest SQL setup script in your Supabase project.');
       } else if (error.message.includes('User already registered')) {
         setMessage('A user with this email already exists. Please use the Sign In button.');
      } else {
         setMessage(error.error_description || error.message);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const MessageDisplay = () => {
      if (!message) return null;
      const Icon = isError ? XCircleIcon : CheckCircleIcon;
      return (
        <div className={`p-4 rounded-md text-sm flex items-start ${isError ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}`}>
            <Icon className="h-5 w-5 mr-3 flex-shrink-0" />
            <span>{message}</span>
        </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-50 dark:bg-navy-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
             <UsaceLogoIcon className="h-12 w-auto text-usace-red" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            USACE PAO KPI Tracker
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-navy-300">
            {mode === 'signIn' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={mode === 'signIn' ? handleLogin : handleSignup}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-800 placeholder-gray-500 dark:placeholder-navy-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-usace-blue focus:border-usace-blue focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-800 placeholder-gray-500 dark:placeholder-navy-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-usace-blue focus:border-usace-blue focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
             {mode === 'signUp' && (
              <div>
                <label htmlFor="team" className="sr-only">Team</label>
                <select 
                  id="team" 
                  value={selectedTeamId} 
                  onChange={(e) => setSelectedTeamId(e.target.value)} 
                  required 
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-800 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-usace-blue focus:border-usace-blue focus:z-10 sm:text-sm"
                >
                  {teams.length === 0 ? (
                    <option disabled>{message ? '' : 'Loading teams...'}</option>
                  ) : (
                    teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)
                  )}
                </select>
              </div>
            )}
          </div>

          <MessageDisplay />

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-usace-blue hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-usace-blue disabled:bg-navy-400 disabled:opacity-75 transition-colors"
            >
              {loading ? 'Processing...' : (mode === 'signIn' ? 'Sign In' : 'Create Account')}
            </button>
          </div>
        </form>
         <p className="mt-2 text-center text-sm text-gray-600 dark:text-navy-300">
            {mode === 'signIn' ? "Don't have an account? " : "Already have an account? "}
            <button
                type="button"
                onClick={() => {
                    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                    setMessage('');
                    setIsError(false);
                }}
                className="font-medium text-usace-blue hover:text-usace-red focus:outline-none"
            >
                {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
            </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;