# Team-Based Social Media Curator Integration

## Overview
This guide explains how to integrate the social media curator with your existing team-based app where `team_id` is stored in user metadata.

---

## 1. Database Setup ✅

Run the SQL script in your Supabase SQL Editor. It creates:
- `social_oauth_tokens` - Team OAuth credentials (one set per team per platform)
- `social_curator_feeds` - Team social feeds
- `social_curator_posts` - Cached posts
- Team-based RLS policies

**Key Point:** Each team gets ONE OAuth connection per platform that all team members share.

---

## 2. How Team Permissions Work

### What Team Members Can Do:
✅ **View** all feeds connected to their team  
✅ **Connect** new platforms for their team  
✅ **Add** new feeds from connected platforms  
✅ **Refresh** any feed in their team  
✅ **Remove** feeds from their team  
✅ **Disconnect** platforms from their team  

### What They Cannot Do:
❌ See feeds from other teams  
❌ Use OAuth tokens from other teams  
❌ Access posts from other teams  

---

## 3. React Component Integration

### Option A: Pass team_id as Prop

```jsx
import { SocialMediaCurator } from './components/SocialMediaCurator';

function TeamDashboard({ teamId }) {
  return (
    <div>
      <h1>Team Dashboard</h1>
      <SocialMediaCurator teamId={teamId} />
    </div>
  );
}
```

Then update the component to accept the prop:
```jsx
const SocialMediaCurator = ({ teamId }) => {
  // Use teamId directly
  // ...
}
```

### Option B: Get from Supabase Auth Context

```jsx
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

const SocialMediaCurator = () => {
  const supabase = useSupabaseClient();
  const user = useUser();
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    if (user?.user_metadata?.team_id) {
      setTeamId(user.user_metadata.team_id);
    }
  }, [user]);

  // Rest of component...
}
```

### Option C: Get from Your Auth Context

```jsx
import { useAuth } from '@/contexts/AuthContext'; // Your existing context

const SocialMediaCurator = () => {
  const { user } = useAuth();
  const teamId = user?.team_id;

  // Rest of component...
}
```

---

## 4. Update Edge Functions with team_id

The edge functions are already updated! They now:
1. Extract `team_id` from user metadata
2. Store/retrieve tokens based on `team_id` instead of `user_id`
3. Ensure RLS policies enforce team isolation

---

## 5. Key Behavioral Changes

### Before (User-based):
- Each user has their own OAuth connections
- User A and User B on the same team would need to connect separately
- Tokens stored per user

### After (Team-based):
- **One OAuth connection per team per platform**
- Any team member can connect a platform for the entire team
- All team members share the same social feeds
- Tokens stored per team

---

## 6. Example User Flows

### Scenario 1: First Team Member Connects YouTube
1. Alice (Team #123) clicks "Connect" on YouTube
2. Alice authenticates with her Google account
3. OAuth tokens are stored with `team_id = 123`
4. **All members of Team #123 can now add YouTube feeds**

### Scenario 2: Second Team Member Adds Feed
1. Bob (also Team #123) adds a YouTube channel feed
2. Feed is created with `team_id = 123`
3. **Alice, Bob, and all Team #123 members see this feed**

### Scenario 3: Different Team
1. Carol (Team #456) does NOT see Team #123's feeds
2. Carol must connect her own team's YouTube account
3. Completely isolated from Team #123

---

## 7. Update your Supabase Client Code

Make sure your Supabase client passes the auth token:

```javascript
// When calling edge functions
const response = await fetch(`${SUPABASE_URL}/functions/v1/save-social-tokens`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}` // Important!
  },
  body: JSON.stringify({ ... })
});
```

The edge functions will automatically extract `team_id` from the JWT token.

---

## 8. Verifying team_id is in User Metadata

Run this query in Supabase SQL Editor to check:

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'team_id' as team_id
FROM auth.users
LIMIT 10;
```

If `team_id` is NULL, you need to ensure it's set during user signup/onboarding.

### To set team_id during signup:

```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      team_id: '123' // Set the team_id here
    }
  }
});
```

---

## 9. Testing Checklist

- [ ] User can see their `team_id` in session
- [ ] User A connects YouTube for their team
- [ ] User B (same team) can see YouTube is connected
- [ ] User B can add a YouTube feed
- [ ] User A can see User B's feed
- [ ] User C (different team) cannot see User A/B's feeds
- [ ] User C must connect their own YouTube account
- [ ] Disconnecting removes access for entire team

---

## 10. Optional: Add Team Name Display

Update the component to show which team's feeds are being managed:

```jsx
const [teamName, setTeamName] = useState('');

useEffect(() => {
  const fetchTeamName = async () => {
    const { data } = await supabase
      .from('teams') // Your teams table
      .select('name')
      .eq('id', teamId)
      .single();
    
    setTeamName(data?.name);
  };
  
  if (teamId) fetchTeamName();
}, [teamId]);

// Then in your UI:
<p className="text-gray-600">Managing feeds for {teamName || 'your team'}</p>
```

---

## 11. Security Considerations

✅ **Row Level Security enforces team isolation**  
✅ **Edge Functions verify team membership**  
✅ **OAuth tokens scoped to team, not individual users**  
✅ **No cross-team data leakage**  

⚠️ **Important:** Any team member can disconnect a platform for the entire team. Consider adding:
- Admin-only disconnect permissions
- Audit logs for OAuth connections/disconnections
- Confirmation dialogs before disconnecting

---

## 12. Common Issues & Solutions

### Issue: "User not associated with a team"
**Solution:** Ensure `team_id` is in user metadata during signup

### Issue: "Cannot view feeds"
**Solution:** Check RLS policies and verify `user_belongs_to_team()` function

### Issue: "Tokens not found"
**Solution:** Verify OAuth connection was completed for the correct team

### Issue: Multiple teams per user
**Solution:** This setup assumes one team per user. For multiple teams, you'd need to:
- Add team selector in UI
- Pass selected `team_id` to all API calls
- Update RLS policies to check team membership table

---

## Need Multi-Team Support?

If users can belong to multiple teams and switch between them, let me know! I can update the schema to support that use case.