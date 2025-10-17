import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface AvatarProps {
  url: string | undefined;
  name: string | undefined;
  size: number;
}

const Avatar: React.FC<AvatarProps> = ({ url, name, size }) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url) {
        // The URL from the profiles table should be a full public URL already.
        // If it's just a path, you would need to download it like this:
        // downloadImage(url);
        setAvatarUrl(url);
    } else {
        setAvatarUrl(null);
    }
  }, [url]);

  const getInitials = (email?: string) => {
    if (!email) return '?';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };
  
  return (
    <div
      className="rounded-full bg-navy-200 dark:bg-navy-600 flex items-center justify-center overflow-hidden"
      style={{ height: size, width: size }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="Avatar"
          className="object-cover"
          style={{ height: size, width: size }}
        />
      ) : (
        <span
          className="font-bold text-usace-blue dark:text-navy-100"
          style={{ fontSize: size / 2.2 }}
        >
          {getInitials(name)}
        </span>
      )}
    </div>
  );
};

export default Avatar;