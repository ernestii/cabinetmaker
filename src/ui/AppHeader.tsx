import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArrowLeft, IconChevronDown } from '@tabler/icons-react';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useStore, type ViewKey } from '../state/store';
import { DEMOS } from '../domain/seed';
import { exportProjectStep } from '../domain/export';
import { VIEWS, groupForView, rememberView, resolveGroupTarget } from './views';
import { NewProjectWizard } from './NewProjectWizard';
import { toast } from './toast';

/** A pending confirmation shown in the branded modal (replaces native confirm()). */
type Confirm = { message: string; confirmLabel: string; onConfirm: () => void };

/**
 * Cabinetmaker mark — a frameless base unit: a drawer over a pair of doors, drawn
 * in the brand accent. Replaces the old saw emoji with something that scales and
 * sits flush with the wordmark.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="12" y1="9.5" x2="12" y2="20.5" />
      {/* handles: drawer pull + the two door pulls flanking the centre seam */}
      <line x1="10.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="10" y1="13" x2="10" y2="16" />
      <line x1="14" y1="13" x2="14" y2="16" />
    </svg>
  );
}

/** Logo + wordmark — used in the mobile bar and the drawer title. */
export function Brand() {
  return (
    <Group gap={7} wrap="nowrap">
      <Logo />
      <Text fw={700} fz="lg" style={{ letterSpacing: '-0.02em' }}>
        Cabinetmaker
      </Text>
    </Group>
  );
}

/**
 * App-wide top header. On desktop it's a single slim row — the project menu
 * (logo + name); view switching lives in the Dock chips in the status bar. On
 * phones it's a compact bar (burger · brand · save) that opens a drawer with the
 * project/file controls. Owns deep-link hash sync so the nav and the URL stay in
 * step.
 */
export function AppHeader() {
  const setView = useStore((s) => s.setView);
  const view = useStore((s) => s.ui.view);
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const exportJSON = useStore((s) => s.exportJSON);
  const loadJSON = useStore((s) => s.loadJSON);
  const resetToBlank = useStore((s) => s.resetToBlank);
  const loadDemo = useStore((s) => s.loadDemo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  const fileRef = useRef<HTMLInputElement>(null);
  const [drawerOpened, drawer] = useDisclosure(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 48em)');

  // Close the mobile drawer if the viewport grows into the desktop layout,
  // otherwise it'd linger with no burger to dismiss it.
  useEffect(() => {
    if (isDesktop) drawer.close();
  }, [isDesktop, drawer]);

  // Deep-linkable tabs: #3d, #cutlist, etc.
  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.replace('#', '') as ViewKey;
      if (VIEWS.some((v) => v.key === h)) setView(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [setView]);

  function doExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-').toLowerCase() || 'project'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    drawer.close();
    toast.success(`Exported ${a.download}`);
  }

  function doExportStep() {
    const { text, filename } = exportProjectStep(project);
    const blob = new Blob([text], { type: 'application/step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    drawer.close();
    toast.success(`Exported ${filename}`);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      if (loadJSON(t)) toast.success('Project loaded.');
      else toast.error("That file isn't a valid Cabinetmaker project.");
    });
    e.target.value = '';
    drawer.close();
  }

  function newProject() {
    drawer.close();
    setConfirm({
      message: 'Start a new blank project? Export the current one first if you want to keep it.',
      confirmLabel: 'New blank project',
      onConfirm: () => {
        resetToBlank();
        toast.success('Started a new blank project.');
      },
    });
  }

  function pickDemo(key: string, label: string) {
    drawer.close();
    setConfirm({
      message: `Load the ${label} demo? This replaces your current project.`,
      confirmLabel: `Load ${label}`,
      onConfirm: () => {
        loadDemo(key);
      },
    });
  }

  // Quick route back into the design space while browsing the report views
  // (cut list / shopping / assembly / materials): a "← Design" pill floats next
  // to the project pill. Lands on the group's remembered Layout-or-3D view,
  // exactly like the Dock's Design chip.
  const inDesign = groupForView(view).key === 'design';
  function backToDesign() {
    const target = resolveGroupTarget(groupForView('layout'));
    setView(target);
    rememberView(target);
    history.replaceState(null, '', `#${target}`);
  }

  const nameField = (
    <TextInput
      value={project.name}
      onChange={(e) =>
        updateProject((p) => {
          p.name = e.target.value;
        })
      }
      aria-label="Project name"
      placeholder="Untitled project"
      size="sm"
      autoComplete="off"
      spellCheck={false}
    />
  );

  // Figma-style file menu: the logo + project name is the trigger. Edit / File /
  // demos all hang off it, so the header has no standalone "Project" button and
  // no always-on name input.
  const projectMenu = (
    <Menu
      position="bottom-start"
      shadow="md"
      width={200}
      withinPortal
    >
      <Menu.Target>
        <Button variant="subtle" color="gray" size="compact-sm" px={7} maw={240} aria-label="Project menu"
          leftSection={<Logo size={18} />} rightSection={<IconChevronDown size={13} />}>
          <Text truncate fz={12} fw={600} c="var(--mantine-color-text)" style={{ letterSpacing: '-0.01em' }}>
            {project.name || 'Untitled project'}
          </Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Edit</Menu.Label>
        <Menu.Item
          onClick={undo}
          disabled={!canUndo}
          rightSection={<Text size="xs" c="dimmed">⌘Z</Text>}
        >
          Undo
        </Menu.Item>
        <Menu.Item
          onClick={redo}
          disabled={!canRedo}
          rightSection={<Text size="xs" c="dimmed">⇧⌘Z</Text>}
        >
          Redo
        </Menu.Item>
        <Menu.Item onClick={() => setRenameOpen(true)}>Rename project…</Menu.Item>
        <Menu.Divider />
        <Menu.Label>File</Menu.Label>
        <Menu.Item onClick={() => fileRef.current?.click()}>Open…</Menu.Item>
        <Menu.Item onClick={doExport}>Export JSON</Menu.Item>
        <Menu.Item onClick={doExportStep}>Export 3D (STEP)…</Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={() => { setWizardOpen(true); drawer.close(); }}>New project…</Menu.Item>
        <Menu.Item onClick={newProject}>New blank project</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Load demo</Menu.Label>
        {DEMOS.map((d) => (
          <Menu.Item key={d.key} onClick={() => pickDemo(d.key, d.label)}>
            {d.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <Box component="header" className="app-header">
      {/* Desktop / tablet: a compact floating project pill (positioned by the
          .app-header CSS) — project menu + sync status. The view switcher is
          the Dock in the bottom status bar, not header tabs. */}
      <Box visibleFrom="sm">
        <Group h={40} px={6} wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
          {projectMenu}
        </Group>
        {/* Anchored to the header's right edge (the header is the fixed
            containing block), so it stays "next to" the pill at any name width. */}
        {!inDesign && (
          <button type="button" className="header-back" onClick={backToDesign} title="Back to Design">
            <IconArrowLeft size={14} stroke={2} />
            Design
          </button>
        )}
      </Box>

      {/* Mobile bar */}
      <Group
        h={56}
        px="sm"
        justify="space-between"
        wrap="nowrap"
        hiddenFrom="sm"
      >
        <Group gap="sm" wrap="nowrap">
          <Burger
            opened={drawerOpened}
            onClick={drawer.toggle}
            size="sm"
            aria-label="Toggle navigation"
          />
          <Brand />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" size="xs" onClick={doExport}>
            Export
          </Button>
        </Group>
      </Group>

      {/* Shared hidden file input for Open… */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={onFile}
      />

      <Drawer
        opened={drawerOpened}
        onClose={drawer.close}
        size="80%"
        padding="md"
        title={<Brand />}
        hiddenFrom="sm"
      >
        <Stack gap="lg">
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Project name
            </Text>
            {nameField}
          </div>

          <div>
            <Text size="xs" c="dimmed" mb={6}>
              File
            </Text>
            <Stack gap={4}>
              <Button
                variant="default"
                justify="flex-start"
                fullWidth
                onClick={() => fileRef.current?.click()}
              >
                Open…
              </Button>
              <Button
                variant="default"
                justify="flex-start"
                fullWidth
                onClick={doExport}
              >
                Export JSON
              </Button>
              <Button
                variant="default"
                justify="flex-start"
                fullWidth
                onClick={doExportStep}
              >
                Export 3D (STEP)…
              </Button>
              <Divider my={4} />
              <Button
                variant="default"
                justify="flex-start"
                fullWidth
                onClick={() => { setWizardOpen(true); drawer.close(); }}
              >
                New project…
              </Button>
              <Button
                variant="default"
                justify="flex-start"
                fullWidth
                onClick={newProject}
              >
                New blank project
              </Button>
            </Stack>
          </div>

          <div>
            <Text size="xs" c="dimmed" mb={6}>
              Load demo
            </Text>
            <Stack gap={4}>
              {DEMOS.map((d) => (
                <Button
                  key={d.key}
                  variant="default"
                  justify="flex-start"
                  fullWidth
                  onClick={() => pickDemo(d.key, d.label)}
                >
                  {d.label}
                </Button>
              ))}
            </Stack>
          </div>
        </Stack>
      </Drawer>

      <NewProjectWizard opened={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title="Rename project" centered size="sm" zIndex={500}>
        <TextInput
          data-autofocus
          value={project.name}
          onChange={(e) => updateProject((p) => { p.name = e.target.value; })}
          placeholder="Untitled project"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter') setRenameOpen(false); }}
        />
        <Group justify="flex-end" mt="md">
          <Button onClick={() => setRenameOpen(false)}>Done</Button>
        </Group>
      </Modal>

      <Modal
        opened={!!confirm}
        onClose={() => setConfirm(null)}
        title="Are you sure?"
        centered
        size="sm"
        zIndex={500}
      >
        <Text size="sm" mb="md">{confirm?.message}</Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            color="danger"
            onClick={() => {
              confirm?.onConfirm();
              setConfirm(null);
            }}
          >
            {confirm?.confirmLabel ?? 'Continue'}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
