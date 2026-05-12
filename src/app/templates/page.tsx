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
    id: 'bug-report',
    category: 'Engineering',
    categoryColor: '#22d3ee',
    time: '4 min',
    title: 'Bug Report',
    description: 'Collect reproducible product defects with impact, environment details, and visual evidence.',
    fields: [{ label: 'What happened?', type: 'rich text' }, { label: 'Steps to reproduce', type: 'rich text' }, { label: 'Severity', type: 'dropdown' }, { label: 'Screenshot proof', type: 'file' }, { label: 'Impact', type: 'rich text' }],
    fieldCount: 5,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Bug Report',
      description: 'Collect reproducible product defects with impact, environment details, and visual evidence.',
      fields: [
        { id: 'f1', type: 'textarea', label: 'What happened?', placeholder: 'Describe the bug clearly', required: true, enabled: true },
        { id: 'f2', type: 'textarea', label: 'Steps to reproduce', placeholder: '1. Go to...\n2. Click...', required: true, enabled: true },
        { id: 'f3', type: 'select', label: 'Severity', options: ['None', 'Low', 'Medium', 'High', 'Critical'], required: true, enabled: true },
        { id: 'f4', type: 'file', label: 'Screenshot proof', required: false, enabled: true },
        { id: 'f5', type: 'textarea', label: 'Impact', placeholder: 'What breaks because of this?', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'nps-survey',
    category: 'Growth',
    categoryColor: '#a78bfa',
    time: '2 min',
    title: 'NPS Survey',
    description: 'Measure product sentiment and capture the reason behind each score.',
    fields: [{ label: 'How likely are you to recommend Walform?', type: 'star rating' }, { label: 'What is the main reason for your score?', type: 'rich text' }, { label: 'Anything else to share?', type: 'rich text' }],
    fieldCount: 3,
    policy: 'open',
    mode: 'signed anon',
    preset: {
      title: 'NPS Survey',
      description: 'Measure product sentiment and capture the reason behind each score.',
      fields: [
        { id: 'f1', type: 'rating', label: 'How likely are you to recommend us? (1–5)', required: true, enabled: true },
        { id: 'f2', type: 'textarea', label: 'What is the main reason for your score?', placeholder: 'Tell us more…', required: true, enabled: true },
        { id: 'f3', type: 'textarea', label: 'Anything else to share?', placeholder: 'Optional feedback', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'feature-request',
    category: 'Product',
    categoryColor: '#34d399',
    time: '5 min',
    title: 'Feature Request',
    description: 'Prioritize product ideas with user context, urgency, and expected outcomes.',
    fields: [{ label: 'What should we build?', type: 'rich text' }, { label: 'What problem does this solve?', type: 'rich text' }, { label: 'Priority', type: 'dropdown' }, { label: 'User impact', type: 'rich text' }, { label: 'Links', type: 'url' }],
    fieldCount: 5,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Feature Request',
      description: 'Prioritize product ideas with user context, urgency, and expected outcomes.',
      fields: [
        { id: 'f1', type: 'textarea', label: 'What should we build?', placeholder: 'Describe the feature', required: true, enabled: true },
        { id: 'f2', type: 'textarea', label: 'What problem does this solve?', required: true, enabled: true },
        { id: 'f3', type: 'select', label: 'Priority', options: ['Low', 'Medium', 'High', 'Critical'], required: true, enabled: true },
        { id: 'f4', type: 'textarea', label: 'User impact', required: false, enabled: true },
        { id: 'f5', type: 'url', label: 'Related links', placeholder: 'https://', required: false, enabled: true },
      ]
    }
  },
  {
    id: 'hackathon',
    category: 'Events',
    categoryColor: '#fbbf24',
    time: '7 min',
    title: 'Hackathon Submission',
    description: 'Review hackathon projects with demo links, team details, track selection, and attestation.',
    fields: [{ label: 'Project summary', type: 'rich text' }, { label: 'Repository URL', type: 'url' }, { label: 'Demo link', type: 'url' }, { label: 'Team members', type: 'rich text' }, { label: 'Track', type: 'dropdown' }, { label: 'Attestation', type: 'checkbox' }],
    fieldCount: 6,
    policy: 'open',
    mode: 'wallet',
    preset: {
      title: 'Hackathon Submission',
      description: 'Review hackathon projects with demo links, team details, track selection, and attestation.',
      fields: [
        { id: 'f1', type: 'textarea', label: 'Project summary', required: true, enabled: true },
        { id: 'f2', type: 'url', label: 'Repository URL', placeholder: 'https://github.com/...', required: true, enabled: true },
        { id: 'f3', type: 'url', label: 'Demo link', placeholder: 'https://', required: false, enabled: true },
        { id: 'f4', type: 'textarea', label: 'Team members', placeholder: 'Name 1, Name 2…', required: true, enabled: true },
        { id: 'f5', type: 'select', label: 'Track', options: ['DeFi', 'NFTs', 'Gaming', 'Infrastructure', 'Social'], required: true, enabled: true },
        { id: 'f6', type: 'checkbox', label: 'I confirm this is my original work', required: true, enabled: true },
      ]
    }
  },
  {
    id: 'dao-survey',
    category: 'Governance',
    categoryColor: '#f87171',
    time: '5 min',
    featured: true,
    title: 'DAO Survey',
    description: 'Gather governance feedback from wallet-linked members before proposals move on-chain.',
    fields: [{ label: 'Proposal stance', type: 'dropdown' }, { label: 'Rationale', type: 'rich text' }, { label: 'Which areas does this touch?', type: 'checkbox group' }, { label: 'Confidence in proposal', type: 'star rating' }],
    fieldCount: 5,
    policy: 'token gated',
    mode: 'wallet',
    preset: {
      title: 'DAO Survey',
      description: 'Gather governance feedback from wallet-linked members before proposals move on-chain.',
      fields: [
        { id: 'f1', type: 'select', label: 'Proposal stance', options: ['Strongly For', 'For', 'Neutral', 'Against', 'Strongly Against'], required: true, enabled: true },
        { id: 'f2', type: 'textarea', label: 'Rationale', placeholder: 'Explain your position…', required: true, enabled: true },
        { id: 'f3', type: 'checkbox', label: 'Which areas does this touch?', options: ['Treasury', 'Protocol', 'Governance', 'Community', 'Technical'], required: false, enabled: true },
        { id: 'f4', type: 'rating', label: 'Confidence in proposal', required: true, enabled: true },
        { id: 'f5', type: 'checkbox', label: 'I confirm this is my wallet-linked vote', required: true, enabled: true },
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
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--bg)' }}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 8 }}>Templates</h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 40 }}>Start with a proven template. Customize, publish, and share in minutes.</p>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {TEMPLATES.map((tmpl, i) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className="card card-hover"
              style={{ padding: 28, borderRadius: 'var(--r-xl)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}
            >
              <div>
                {/* Tags row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {categoryBadge(tmpl.category, tmpl.categoryColor)}
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{tmpl.time}</span>
                  {tmpl.featured && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>Featured</span>}
                </div>

                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>{tmpl.title}</h2>
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>{tmpl.description}</p>

                {/* Field preview grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {tmpl.fields.slice(0, 4).map((f, fi) => (
                    <FieldPreview key={fi} label={f.label} type={f.type} />
                  ))}
                </div>

                {/* Meta */}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)' }}>
                  <span>{tmpl.fieldCount} fields</span>
                  <span>·</span>
                  <span>Policy: {tmpl.policy}</span>
                  <span>·</span>
                  <span>Mode: {tmpl.mode}</span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => useTemplate(tmpl)}
                style={{ whiteSpace: 'nowrap', padding: '10px 20px' }}
              >
                Use template
              </button>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
