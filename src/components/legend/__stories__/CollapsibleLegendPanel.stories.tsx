import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CollapsibleLegendPanel } from '../index';
import { createDefaultLegendSettings } from '@/data/realThreddsLayers';
import type { LegendSettings } from '@/data/realThreddsLayers';

/**
 * CollapsibleLegendPanel - Collapsible accordion for legend editing
 *
 * Used in MapPanel for inline legend customization with minimal space usage.
 */
const meta = {
  title: 'Components/Legend/CollapsibleLegendPanel',
  component: CollapsibleLegendPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Collapsible panel for legend symbology editing. Supports both controlled and uncontrolled modes. ' +
          'Features accordion pattern with proper ARIA, keyboard navigation, and granular reset controls.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    legendSettings: { control: false },
    onLegendSettingsChange: { action: 'legend changed' },
    countryCode: {
      control: 'select',
      options: ['VU', 'WS', 'TO', 'CK'],
    },
    isExpanded: { control: 'boolean' },
    defaultExpanded: { control: 'boolean' },
  },
} satisfies Meta<typeof CollapsibleLegendPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Wrapper component with state management for Storybook
 */
function ControlledPanelWrapper({ defaultExpanded = false, countryCode = 'VU' as const }) {
  const [settings, setSettings] = useState<LegendSettings>(() =>
    createDefaultLegendSettings(countryCode)
  );
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="w-96 bg-slate-950 p-4 rounded-lg">
      <CollapsibleLegendPanel
        legendSettings={settings}
        onLegendSettingsChange={setSettings}
        countryCode={countryCode}
        isExpanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
    </div>
  );
}

function UncontrolledPanelWrapper({ defaultExpanded = false, countryCode = 'VU' as const }) {
  const [settings, setSettings] = useState<LegendSettings>(() =>
    createDefaultLegendSettings(countryCode)
  );

  return (
    <div className="w-96 bg-slate-950 p-4 rounded-lg">
      <CollapsibleLegendPanel
        legendSettings={settings}
        onLegendSettingsChange={setSettings}
        countryCode={countryCode}
        defaultExpanded={defaultExpanded}
      />
    </div>
  );
}

/**
 * Default collapsed state - click to expand and edit thresholds
 */
export const Collapsed: Story = {
  render: () => <ControlledPanelWrapper defaultExpanded={false} />,
};

/**
 * Default expanded state - showing all editable sections
 */
export const Expanded: Story = {
  render: () => <ControlledPanelWrapper defaultExpanded={true} />,
};

/**
 * Uncontrolled mode - panel manages its own expand/collapse state
 */
export const Uncontrolled: Story = {
  render: () => <UncontrolledPanelWrapper defaultExpanded={true} />,
  parameters: {
    docs: {
      description: {
        story: 'Panel manages its own expanded state internally. Useful for standalone usage.',
      },
    },
  },
};

/**
 * Vanuatu-specific legend configuration
 */
export const VanuatuConfig: Story = {
  render: () => <ControlledPanelWrapper defaultExpanded={true} countryCode="VU" />,
  parameters: {
    docs: {
      description: {
        story: 'Legend configuration for Vanuatu (VU) with country-specific loss thresholds.',
      },
    },
  },
};

/**
 * Interactive keyboard navigation demo
 */
export const KeyboardNavigation: Story = {
  render: () => (
    <div className="w-96 bg-slate-950 p-4 rounded-lg space-y-4">
      <div className="text-xs text-slate-400 p-2 bg-slate-900/50 rounded border border-slate-700">
        <strong>Try keyboard navigation:</strong>
        <ul className="mt-1 ml-4 list-disc space-y-1">
          <li>
            Press <kbd className="px-1 py-0.5 bg-slate-800 rounded">Tab</kbd> to focus header
          </li>
          <li>
            Press <kbd className="px-1 py-0.5 bg-slate-800 rounded">Enter</kbd> or{' '}
            <kbd className="px-1 py-0.5 bg-slate-800 rounded">Space</kbd> to toggle
          </li>
          <li>
            Press <kbd className="px-1 py-0.5 bg-slate-800 rounded">Tab</kbd> to navigate inputs
          </li>
          <li>
            Press <kbd className="px-1 py-0.5 bg-slate-800 rounded">Shift+Tab</kbd> to go back
          </li>
        </ul>
      </div>
      <ControlledPanelWrapper defaultExpanded={false} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Full keyboard navigation support. All controls are accessible without a mouse.',
      },
    },
  },
};

/**
 * Accessibility testing scenario
 */
export const AccessibilityTest: Story = {
  render: () => <ControlledPanelWrapper defaultExpanded={true} />,
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'label', enabled: true },
          { id: 'button-name', enabled: true },
          { id: 'aria-allowed-attr', enabled: true },
        ],
      },
    },
    docs: {
      description: {
        story: 'Run automated accessibility checks on this story using the a11y addon.',
      },
    },
  },
};
