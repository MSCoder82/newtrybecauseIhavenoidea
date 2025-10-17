import React, { useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { useNotification } from '../contexts/NotificationProvider';
import Avatar from './Avatar';

interface ProfilePageProps {
  session: Session;
  profile: Profile;
  onProfileUpdate: (updatedProfileData: Partial<Profile>) => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ session, profile, onProfileUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const { showToast } = useNotification();

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${session.user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      if (!publicUrl) {
          throw new Error("Could not get public URL for the uploaded avatar.");
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) {
        throw updateError;
      }

      onProfileUpdate({ avatarUrl: publicUrl });

    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-navy-800 p-6 md:p-8 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">My Profile</h2>
      <div className="flex flex-col items-center space-y-4">
        <Avatar url={profile.avatarUrl} name={session.user.email} size={128} />
        <div>
          <label htmlFor="avatar-upload" className="cursor-pointer inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
            {uploading ? 'Uploading...' : 'Upload new avatar'}
          </label>
          <input
            id="avatar-upload"
            type="file"
            className="hidden"
            accept="image/*"
            onChange={uploadAvatar}
            disabled={uploading}
          />
        </div>
      </div>
      <div className="mt-8 border-t border-gray-200 dark:border-navy-700 pt-6">
        <dl className="space-y-4">
            <div className="sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-gray-500 dark:text-navy-400">Email Address</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">{session.user.email}</dd>
            </div>
             <div className="sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-gray-500 dark:text-navy-400">Team</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">{profile.teamName}</dd>
            </div>
             <div className="sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-gray-500 dark:text-navy-400">Role</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2 capitalize">{profile.role}</dd>
            </div>
        </dl>
      </div>
    </div>
  );
};

export default ProfilePage;