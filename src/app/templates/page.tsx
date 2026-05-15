'use client';
import { motion } from 'framer-motion';

interface Template {
  id: string;
  category: string;
  categoryColor: string;
  time: string;
  featured?: boolean;
  title: string;
  description: string;
  fields: { label: string; type: string }[];
  fieldCount: number;
  policy: string;
  mode: string;
  preset: Record<string, unknown>;
}

const TEMPLATES: Template[] = [
  {
    id: 'walrus-sessions',
    category: 'Events',
    categoryColor: '#fbbf24',
    time: '2 min',
    featured: true,
    title: 'Walrus Sessions',
    description: 'The official application form for Walrus Sessions. 100% on-chain and decentralized.',
    fields: [
      { label: 'Project Name', type: 'text' },
      { label: 'Session Selection', type: 'checkbox' },
      { label: 'Team Leader Name', type: 'text' },
      { label: 'Team Leader Email', type: 'email' },
      { label: 'Discord Handle', type: 'text' }
    ],
    fieldCount: 21,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Walrus Sessions — Application Form',
      description: 'Submit your project for review by the Walrus Sessions team.',
      fields: [
        { id: 'project_name',      label: 'Project Name*', type: 'text', required: true, enabled: true, placeholder: 'Your project name' },
        { id: 'session_select',    label: 'Session Selection*', type: 'checkbox', required: true, enabled: true },
        { id: 'leader_name',       label: 'Team Leader Name*', type: 'text', required: true, enabled: true, placeholder: 'Full name' },
        { id: 'leader_email',      label: 'Team Leader Email*', type: 'email', required: true, enabled: true, placeholder: 'email@example.com' },
        { id: 'newsletter',        label: 'I would be open to receiving your newsletter', type: 'checkbox', required: false, enabled: true, attachedCheckbox: true },
        { id: 'leader_telegram',   label: 'Team Leader Telegram Handle', type: 'text', required: false, enabled: true, placeholder: '@username' },
        { id: 'discord_handle',    label: 'Discord Handle*', type: 'text', required: true, enabled: true, placeholder: 'username', helpText: 'Make sure to join our discord — it is required and how we contact you.', linkText: 'Join Discord', linkUrl: 'https://discord.gg/walrusprotocol' },
        { id: 'deepsurge_link',    label: 'DeepSurge Project Link*', type: 'url', required: true, enabled: true, placeholder: 'https://', helpText: 'Needs to be on mainnet' },
        { id: 'website_link',      label: 'Form / Website Link*', type: 'url', required: true, enabled: true, placeholder: 'https://' },
        { id: 'workflow_desc',     label: 'Describe the workflow and functionalities of your form*', type: 'textarea', required: true, enabled: true, placeholder: 'Admin flow: create a form, update form, review replies\nUser flow: Submit a form' },
        { id: 'visuals',           label: 'Share any visuals of your form*', type: 'file', required: true, enabled: true, helpText: 'Screenshots or images' },
        { id: 'demo_video',        label: 'Demo video of the form (sub 3 minutes)*', type: 'url', required: true, enabled: true, placeholder: 'https://youtube.com/... or https://loom.com/...' },
        { id: 'differentiator',    label: 'Which features set your solution apart from the rest?*', type: 'textarea', required: true, enabled: true, placeholder: 'Describe your unique features...' },
        { id: 'walrus_feedback',   label: 'Feedback (about building on Walrus)*', type: 'textarea', required: true, enabled: true, placeholder: 'What worked well, challenges encountered, missing features, issues with access, suggestions for improving the developer experience...' },
        { id: 'x_account',         label: 'X Account', type: 'text', required: false, enabled: true, placeholder: '@username' },
        { id: 'x_tweet_link',      label: 'Share link to X tweet*', type: 'url', required: true, enabled: true, placeholder: 'https://x.com/...' },
        { id: 'sui_address',       label: 'SUI Address*', type: 'text', required: true, enabled: true, placeholder: '0x...' },
        { id: 'github',            label: 'GitHub*', type: 'url', required: true, enabled: true, placeholder: 'https://github.com/...', helpText: 'Link to your GitHub profile and relevant repositories.' },
        { id: 'session_feedback',  label: 'Session Feedback', type: 'textarea', required: false, enabled: true, placeholder: 'Optional...', helpText: 'Thoughts on the sessions. No impact on rewards.' },
        { id: 'deepsurge_feedback',label: 'DeepSurge Feedback', type: 'textarea', required: false, enabled: true, placeholder: 'Optional...', helpText: 'Thoughts on DeepSurge. No impact on rewards.' },
        { id: 'rules_confirm',     label: 'I confirm I have read, understood, and agree to the rules and regulations of the session.*', type: 'checkbox', required: true, enabled: true, linkText: 'View Rules', linkUrl: 'https://thewalrussessions.wal.app/' },
      ]
    }
  },
  {
    id: 'bug-report',
    category: 'Engineering',
    categoryColor: '#ef4444',
    time: '4 min',
    featured: true,
    title: 'Bug Report',
    description: 'Perfect for dApps, protocols, and games to collect bug reports with screenshots and reproduction steps.',
    fields: [
      { label: 'Bug Title', type: 'text' },
      { label: 'Severity', type: 'dropdown' },
      { label: 'Screenshot', type: 'file' },
      { label: 'Reproduction Steps', type: 'textarea' },
      { label: 'Wallet/Browser/Device', type: 'text' },
      { label: 'Expected vs Actual', type: 'textarea' }
    ],
    fieldCount: 6,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Bug Report',
      description: 'Report an issue you encountered in our dApp, protocol, or game.',
      fields: [
        { id: 'bug_title', type: 'text', label: 'Bug Title*', placeholder: 'Short summary of the bug', required: true, enabled: true },
        { id: 'severity', type: 'select', label: 'Severity*', options: ['Low', 'Medium', 'High', 'Critical'], required: true, enabled: true },
        { id: 'screenshot', type: 'file', label: 'Screenshot', required: false, enabled: true, helpText: 'Upload visual evidence of the bug.' },
        { id: 'repro_steps', type: 'textarea', label: 'Reproduction Steps*', placeholder: '1. Go to...\n2. Click on...\n3. See error...', required: true, enabled: true },
        { id: 'env_info', type: 'text', label: 'Wallet / Browser / Device*', placeholder: 'e.g. Sui Wallet / Chrome / Windows 11', required: true, enabled: true },
        { id: 'expected_actual', type: 'textarea', label: 'Expected vs Actual Behavior', placeholder: 'Expected: ...\nActual: ...', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'feature-request',
    category: 'Product',
    categoryColor: '#34d399',
    time: '3 min',
    title: 'Feature Request',
    description: 'Collect and prioritize product ideas, use cases, and mockups from your users.',
    fields: [
      { label: 'Feature Title', type: 'text' },
      { label: 'Category', type: 'dropdown' },
      { label: 'Description', type: 'textarea' },
      { label: 'Use Case', type: 'textarea' },
      { label: 'Priority Rating', type: 'rating' },
      { label: 'Mockup', type: 'file' }
    ],
    fieldCount: 6,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Feature Request',
      description: 'Tell us what we should build next to improve your experience.',
      fields: [
        { id: 'feature_title', type: 'text', label: 'Feature Title*', placeholder: 'Name of the feature', required: true, enabled: true },
        { id: 'category', type: 'select', label: 'Category*', options: ['UI/UX', 'Core Functionality', 'Integration', 'Other'], required: true, enabled: true },
        { id: 'description', type: 'textarea', label: 'Description*', placeholder: 'Describe how it should work...', required: true, enabled: true },
        { id: 'use_case', type: 'textarea', label: 'Use Case', placeholder: 'In what situation would you use this?', required: false, enabled: true },
        { id: 'priority', type: 'rating', label: 'Priority Rating*', required: true, enabled: true },
        { id: 'mockup', type: 'file', label: 'Mockup Upload', required: false, enabled: true, helpText: 'Upload any sketches or mockups.' },
      ]
    }
  },
  {
    id: 'grant-application',
    category: 'Funding',
    categoryColor: '#3b82f6',
    time: '10 min',
    featured: true,
    title: 'Grant / Application Form',
    description: 'Perfect for the Walrus & Sui ecosystem to intake project grant applications.',
    fields: [
      { label: 'Project Name', type: 'text' },
      { label: 'Team Members', type: 'textarea' },
      { label: 'GitHub', type: 'url' },
      { label: 'Demo Link', type: 'url' },
      { label: 'Pitch Deck', type: 'file' },
      { label: 'Funding Ask', type: 'text' },
      { label: 'Milestones', type: 'textarea' },
      { label: 'Demo Video', type: 'url' }
    ],
    fieldCount: 8,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Grant Application',
      description: 'Apply for funding to build your project in our ecosystem.',
      fields: [
        { id: 'project_name', type: 'text', label: 'Project Name*', placeholder: 'Your project name', required: true, enabled: true },
        { id: 'team_members', type: 'textarea', label: 'Team Members*', placeholder: 'Names and roles...', required: true, enabled: true },
        { id: 'github_link', type: 'url', label: 'GitHub Link*', placeholder: 'https://github.com/...', required: true, enabled: true },
        { id: 'demo_link', type: 'url', label: 'Demo Link', placeholder: 'https://...', required: false, enabled: true },
        { id: 'pitch_deck', type: 'file', label: 'Pitch Deck*', required: true, enabled: true },
        { id: 'funding_ask', type: 'text', label: 'Funding Ask (USD)*', placeholder: '$10,000', required: true, enabled: true },
        { id: 'milestone_plan', type: 'textarea', label: 'Milestone Plan*', placeholder: 'Month 1: ...\nMonth 2: ...', required: true, enabled: true },
        { id: 'demo_video', type: 'url', label: 'Demo Video', placeholder: 'https://youtube.com/...', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'hackathon-submission',
    category: 'Events',
    categoryColor: '#fbbf24',
    time: '5 min',
    featured: true,
    title: 'Hackathon Submission',
    description: 'A mandatory template for collecting hackathon projects, demos, and presentations.',
    fields: [
      { label: 'Project Name', type: 'text' },
      { label: 'Wallet Address', type: 'text' },
      { label: 'GitHub', type: 'url' },
      { label: 'Demo', type: 'url' },
      { label: 'Screenshots', type: 'file' },
      { label: 'Presentation Video', type: 'url' },
      { label: 'Feedback', type: 'textarea' }
    ],
    fieldCount: 7,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Hackathon Submission',
      description: 'Submit your hackathon project for judging.',
      fields: [
        { id: 'project_name', type: 'text', label: 'Project Name*', placeholder: 'Your project name', required: true, enabled: true },
        { id: 'wallet_address', type: 'text', label: 'Reward Wallet Address*', placeholder: '0x...', required: true, enabled: true },
        { id: 'github_link', type: 'url', label: 'GitHub Repository*', placeholder: 'https://github.com/...', required: true, enabled: true },
        { id: 'demo_link', type: 'url', label: 'Demo Link', placeholder: 'https://...', required: false, enabled: true },
        { id: 'screenshots', type: 'file', label: 'Screenshots*', required: true, enabled: true },
        { id: 'presentation_video', type: 'url', label: 'Presentation Video*', placeholder: 'https://youtube.com/...', required: true, enabled: true },
        { id: 'feedback', type: 'textarea', label: 'Feedback for Organizers', placeholder: 'Optional...', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'community-feedback',
    category: 'Community',
    categoryColor: '#a78bfa',
    time: '3 min',
    title: 'Community Feedback',
    description: 'Gather actionable feedback from your community on sessions and events.',
    fields: [
      { label: 'Session Rating', type: 'rating' },
      { label: 'Speaker Feedback', type: 'textarea' },
      { label: 'Suggestions', type: 'textarea' },
      { label: 'Favorite Part', type: 'text' },
      { label: 'Improvement Ideas', type: 'textarea' }
    ],
    fieldCount: 5,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Community Feedback',
      description: 'Help us improve our future sessions by sharing your thoughts.',
      fields: [
        { id: 'session_rating', type: 'rating', label: 'Session Rating*', required: true, enabled: true },
        { id: 'speaker_feedback', type: 'textarea', label: 'Speaker Feedback', placeholder: 'Any specific feedback for speakers?', required: false, enabled: true },
        { id: 'suggestions', type: 'textarea', label: 'Suggestions for future topics', placeholder: 'What do you want to hear about next?', required: false, enabled: true },
        { id: 'favorite_part', type: 'text', label: 'Favorite Part', placeholder: 'The best thing was...', required: false, enabled: true },
        { id: 'improvement_ideas', type: 'textarea', label: 'Improvement Ideas', placeholder: 'How can we do better?', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'beta-tester',
    category: 'Growth',
    categoryColor: '#f472b6',
    time: '2 min',
    title: 'Beta Tester Signup',
    description: 'Recruit beta testers, log their devices, and track their interest areas.',
    fields: [
      { label: 'Wallet', type: 'text' },
      { label: 'Device', type: 'dropdown' },
      { label: 'Experience Level', type: 'dropdown' },
      { label: 'Telegram/Discord', type: 'text' },
      { label: 'Interest Areas', type: 'checkbox' }
    ],
    fieldCount: 5,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Beta Tester Signup',
      description: 'Sign up to be the first to test our new features.',
      fields: [
        { id: 'wallet_address', type: 'text', label: 'Wallet Address*', placeholder: '0x...', required: true, enabled: true },
        { id: 'device', type: 'select', label: 'Primary Device*', options: ['Desktop/Laptop', 'iOS', 'Android', 'Other'], required: true, enabled: true },
        { id: 'experience', type: 'select', label: 'Web3 Experience Level*', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], required: true, enabled: true },
        { id: 'social_handle', type: 'text', label: 'Telegram / Discord Handle*', placeholder: '@username', required: true, enabled: true },
        { id: 'interest_areas', type: 'checkbox', label: 'Interest Areas', options: ['DeFi', 'Gaming', 'NFTs', 'Infrastructure', 'Social'], required: false, enabled: true },
      ]
    }
  },
  {
    id: 'job-application',
    category: 'HR',
    categoryColor: '#2dd4bf',
    time: '6 min',
    title: 'Job / Contributor Application',
    description: 'Accept applications for roles and bounties directly into your decentralized inbox.',
    fields: [
      { label: 'Role', type: 'text' },
      { label: 'Portfolio', type: 'url' },
      { label: 'Resume', type: 'file' },
      { label: 'Timezone', type: 'text' },
      { label: 'Social Links', type: 'url' },
      { label: 'Experience', type: 'textarea' }
    ],
    fieldCount: 6,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Job / Contributor Application',
      description: 'Apply for a core team role or contributor bounty.',
      fields: [
        { id: 'role', type: 'text', label: 'Role / Bounty Name*', placeholder: 'Frontend Developer', required: true, enabled: true },
        { id: 'portfolio', type: 'url', label: 'Portfolio / Website', placeholder: 'https://...', required: false, enabled: true },
        { id: 'resume', type: 'file', label: 'Resume Upload*', required: true, enabled: true },
        { id: 'timezone', type: 'text', label: 'Timezone*', placeholder: 'e.g. UTC+7', required: true, enabled: true },
        { id: 'social_links', type: 'url', label: 'LinkedIn / X Profile', placeholder: 'https://...', required: false, enabled: true },
        { id: 'experience', type: 'textarea', label: 'Relevant Experience*', placeholder: 'Tell us about your background...', required: true, enabled: true },
      ]
    }
  },
  {
    id: 'dao-governance',
    category: 'Governance',
    categoryColor: '#818cf8',
    time: '4 min',
    title: 'DAO Governance Feedback',
    description: 'Collect structured sentiment on DAO proposals before they go on-chain.',
    fields: [
      { label: 'Proposal Opinion', type: 'dropdown' },
      { label: 'Vote Reasoning', type: 'textarea' },
      { label: 'Attachments', type: 'file' },
      { label: 'Sentiment Rating', type: 'rating' }
    ],
    fieldCount: 4,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'DAO Governance Feedback',
      description: 'Share your thoughts on the active DAO proposal.',
      fields: [
        { id: 'proposal_opinion', type: 'select', label: 'Proposal Opinion*', options: ['Strongly Support', 'Support', 'Neutral', 'Oppose', 'Strongly Oppose'], required: true, enabled: true },
        { id: 'vote_reasoning', type: 'textarea', label: 'Vote Reasoning*', placeholder: 'Why are you voting this way?', required: true, enabled: true },
        { id: 'attachments', type: 'file', label: 'Supporting Documents', required: false, enabled: true },
        { id: 'sentiment_rating', type: 'rating', label: 'Overall Sentiment on DAO Direction', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'creator-submission',
    category: 'Creative',
    categoryColor: '#fb923c',
    time: '3 min',
    title: 'Creator Submission',
    description: 'Receive art, videos, and creative assets directly with licensing details.',
    fields: [
      { label: 'Artwork Upload', type: 'file' },
      { label: 'Description', type: 'textarea' },
      { label: 'Socials', type: 'url' },
      { label: 'Licensing', type: 'checkbox' }
    ],
    fieldCount: 4,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Creator Submission',
      description: 'Submit your creative work for our campaign.',
      fields: [
        { id: 'artwork_upload', type: 'file', label: 'Artwork Upload*', required: true, enabled: true },
        { id: 'description', type: 'textarea', label: 'Artwork Description*', placeholder: 'Tell us about your piece...', required: true, enabled: true },
        { id: 'socials', type: 'url', label: 'Your Social Profile', placeholder: 'https://...', required: false, enabled: true },
        { id: 'licensing', type: 'checkbox', label: 'Licensing Terms*', options: ['I grant permission to use this artwork', 'Creative Commons (CC-BY)'], required: true, enabled: true },
      ]
    }
  },
  {
    id: 'investor-intake',
    category: 'Business',
    categoryColor: '#94a3b8',
    time: '5 min',
    title: 'Investor / Partnership Intake',
    description: 'Streamline incoming requests from potential partners and investors.',
    fields: [
      { label: 'Company/Project', type: 'text' },
      { label: 'Contact', type: 'text' },
      { label: 'Deck Upload', type: 'file' },
      { label: 'Proposal', type: 'textarea' },
      { label: 'Goals', type: 'textarea' }
    ],
    fieldCount: 5,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Investor / Partnership Intake',
      description: 'Fill out this form to explore partnership or investment opportunities.',
      fields: [
        { id: 'company_name', type: 'text', label: 'Company / Project Name*', placeholder: 'Your organization', required: true, enabled: true },
        { id: 'contact_info', type: 'text', label: 'Contact Information*', placeholder: 'Email or Telegram', required: true, enabled: true },
        { id: 'deck_upload', type: 'file', label: 'Pitch Deck Upload', required: false, enabled: true },
        { id: 'proposal', type: 'textarea', label: 'Partnership Proposal*', placeholder: 'What are you proposing?', required: true, enabled: true },
        { id: 'goals', type: 'textarea', label: 'Mutual Goals*', placeholder: 'What do you hope to achieve?', required: true, enabled: true },
      ]
    }
  },
];

function categoryBadge(label: string, color: string) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, border: `1px solid ${color}33`, color, background: `${color}11` }}>
      {label}
    </span>
  );
}

function FieldPreview({ label, type }: { label: string; type: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{type}</div>
    </div>
  );
}

export default function TemplatesPage() {
  function useTemplate(template: Template) {
    const encoded = encodeURIComponent(JSON.stringify(template.preset));
    window.location.href = `/builder?template=${encoded}`;
  }

  return (
    <div className="surface-layer-1" style={{ minHeight: '100dvh' }}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 24px' }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 48, textAlign: 'center' }}
        >
          <div style={{ 
            display: 'inline-block', padding: '6px 12px', borderRadius: '12px', 
            background: 'var(--accent-soft)', color: 'var(--accent-2)', 
            fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', 
            letterSpacing: '0.1em', marginBottom: 16 
          }}>
            Explore Blueprints
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: 12, lineHeight: 1.1 }}>
            Ready-to-use <span className="text-glow-teal">Templates</span>
          </h1>
          <p style={{ fontSize: 18, color: 'var(--text-2)', maxWidth: 600, margin: '0 auto' }}>
            Launch professional on-chain forms in seconds with our curated library of Web3-optimized templates.
          </p>
        </motion.div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
          gap: 24 
        }}>
          {TEMPLATES.map((tmpl, i) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
              className="card-premium"
              style={{ 
                padding: 32, 
                display: 'flex', 
                flexDirection: 'column',
                height: '100%',
                border: tmpl.featured ? '1px solid var(--accent-soft)' : '1px solid var(--border)',
                background: tmpl.featured ? 'linear-gradient(180deg, rgba(13, 148, 136, 0.05) 0%, rgba(255,255,255,0.02) 100%)' : 'linear-gradient(180deg, rgba(13, 148, 136, 0.03) 0%, rgba(255,255,255,0.01) 100%)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '80%', height: '100%', background: tmpl.featured ? 'radial-gradient(ellipse at top, rgba(13, 148, 136, 0.2), transparent 60%)' : 'radial-gradient(ellipse at top, rgba(13, 148, 136, 0.1), transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {categoryBadge(tmpl.category, tmpl.categoryColor)}
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', padding: '4px 0' }}>{tmpl.time}</span>
                  </div>
                  {tmpl.featured && (
                    <div className="glow-sm" style={{ 
                      fontSize: 10, fontWeight: 900, padding: '4px 10px', borderRadius: 8, 
                      background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24',
                      textTransform: 'uppercase'
                    }}>
                      Featured
                    </div>
                  )}
                </div>

                <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12, color: 'var(--text-1)' }}>{tmpl.title}</h2>
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24, flex: 1 }}>{tmpl.description}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 32 }}>
                  {tmpl.fields.slice(0, 4).map((f, fi) => (
                    <div key={fi} style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.05)', 
                      borderRadius: 12, padding: '10px 12px' 
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{f.type}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</div>
                    </div>
                  ))}
                  {tmpl.fields.length > 4 && (
                    <div style={{ 
                      gridColumn: 'span 2', textAlign: 'center', fontSize: 11, fontWeight: 700, 
                      color: 'var(--text-3)', padding: '6px', background: 'rgba(255,255,255,0.01)', borderRadius: 8 
                    }}>
                      + {tmpl.fields.length - 4} more fields
                    </div>
                  )}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-primary"
                onClick={() => useTemplate(tmpl)}
                style={{ 
                  width: '100%', justifyContent: 'center', height: 48, fontSize: 14, fontWeight: 800,
                  boxShadow: tmpl.featured ? '0 4px 20px rgba(139, 92, 246, 0.4)' : 'none',
                  background: tmpl.featured ? 'linear-gradient(135deg, #8b5cf6, #d946ef)' : undefined,
                  border: tmpl.featured ? 'none' : undefined,
                }}
              >
                Use this Blueprint
              </motion.button>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
