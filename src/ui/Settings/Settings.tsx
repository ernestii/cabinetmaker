import { Select, Switch, TextInput } from '@mantine/core';
import { useStore } from '../../state/store';
import { InchInput } from '../components/InchInput';
import { InfoTip } from '../components/InfoTip';
import type { BackStyle, DrawerJoint, HandleType, SlideType } from '../../domain/types';
import { BACK_STYLE_OPTS, DOOR_HANDLE_OPTS, DRAWER_HANDLE_OPTS, DRAWER_JOINT_OPTS, SLIDE_TYPE_OPTS } from '../constructionOptions';

/** One inspector-style property row: label (with optional (i) help) left, control right. */
function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}{info ? <InfoTip label={info} /> : null}</span>
      {children}
    </label>
  );
}

/**
 * Project-wide defaults — the same dimensions + construction the New Project
 * wizard collects, laid out like the Inspector (grouped sections of label/value
 * rows). Reads/writes the store directly; shown in the "Project Settings" modal.
 */
export function Settings() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const wall = project.rooms[0]?.walls[0];

  const setWall = (patch: Partial<NonNullable<typeof wall>>) =>
    updateProject((p) => { const w = p.rooms[0]?.walls[0]; if (w) Object.assign(w, patch); });
  const setDefault = (patch: Partial<typeof project.defaults>) =>
    updateProject((p) => { Object.assign(p.defaults, patch); });

  const d = project.defaults;

  return (
    <div className="settings-form">
      {wall && (
        <section className="insp-section">
          <div className="insp-head"><h3>Wall</h3></div>
          <div className="settings-grid">
            <Row label="Name">
              <TextInput size="xs" w="100%" value={wall.name} onChange={(e) => setWall({ name: e.currentTarget.value })} />
            </Row>
            <Row label="Length"><InchInput value={wall.lengthIn} min={12} w="100%" onCommit={(v) => setWall({ lengthIn: v })} /></Row>
            <Row label="Ceiling height"><InchInput value={wall.ceilingHeightIn} min={48} w="100%" onCommit={(v) => setWall({ ceilingHeightIn: v })} /></Row>
          </div>
        </section>
      )}

      <section className="insp-section">
        <div className="insp-head"><h3>Vertical layout</h3></div>
        <div className="settings-grid">
          <Row label="Counter height"><InchInput value={d.counterHeightIn} w="100%" onCommit={(v) => setDefault({ counterHeightIn: v })} /></Row>
          <Row label="Counter thickness" info="1–4 inches"><InchInput value={d.counterThicknessIn} min={1} max={4} step={0.25} w="100%" onCommit={(v) => setDefault({ counterThicknessIn: v })} /></Row>
          <Row label="Counter depth"><InchInput value={d.counterDepthIn ?? d.baseDepthIn + 1} w="100%" onCommit={(v) => setDefault({ counterDepthIn: v })} /></Row>
          <Row label="Upper height"><InchInput value={d.upperHeightIn} w="100%" onCommit={(v) => setDefault({ upperHeightIn: v })} /></Row>
          <Row label="Upper ceiling gap"><InchInput value={d.upperCeilingGapIn} w="100%" onCommit={(v) => setDefault({ upperCeilingGapIn: v })} /></Row>
          <Row label="Countertop" info="Build a worktop over base runs (included in the cut list)">
            <Switch checked={d.countertopEnabled !== false} onChange={(e) => setDefault({ countertopEnabled: e.currentTarget.checked })} />
          </Row>
        </div>
      </section>

      <section className="insp-section">
        <div className="insp-head"><h3>Cabinet depths</h3></div>
        <div className="settings-grid">
          <Row label="Base depth"><InchInput value={d.baseDepthIn} w="100%" onCommit={(v) => setDefault({ baseDepthIn: v })} /></Row>
          <Row label="Upper depth"><InchInput value={d.upperDepthIn} w="100%" onCommit={(v) => setDefault({ upperDepthIn: v })} /></Row>
          <Row label="Tall depth"><InchInput value={d.tallDepthIn} w="100%" onCommit={(v) => setDefault({ tallDepthIn: v })} /></Row>
          <Row label="Leg height"><InchInput value={d.legHeightIn} step={0.25} w="100%" onCommit={(v) => setDefault({ legHeightIn: v })} /></Row>
        </div>
      </section>

      <section className="insp-section">
        <div className="insp-head"><h3>Construction</h3></div>
        <div className="settings-grid">
          <Row label="Cabinet back" info="Full panel, or top/bottom hanging rails to save plywood">
            <Select size="xs" w="100%" allowDeselect={false} data={BACK_STYLE_OPTS} value={d.backStyle} onChange={(v) => v && setDefault({ backStyle: v as BackStyle })} />
          </Row>
          <Row label="Drawer joint" info="A cabinet can override this">
            <Select size="xs" w="100%" allowDeselect={false} data={DRAWER_JOINT_OPTS} value={d.drawerJoint} onChange={(v) => v && setDefault({ drawerJoint: v as DrawerJoint })} />
          </Row>
          <Row label="Slide type" info="Side- vs under-mount">
            <Select size="xs" w="100%" allowDeselect={false} data={SLIDE_TYPE_OPTS} value={d.slideType} onChange={(v) => v && setDefault({ slideType: v as SlideType })} />
          </Row>
          <Row label="Dado depth" info="Front/back seating depth"><InchInput value={d.dadoDepthIn} min={0.0625} step={0.0625} w="100%" onCommit={(v) => setDefault({ dadoDepthIn: v })} /></Row>
        </div>
      </section>

      <section className="insp-section">
        <div className="insp-head"><h3>Default pulls</h3></div>
        <div className="settings-grid">
          <Row label="Drawer pull" info="A front can override this">
            <Select size="xs" w="100%" allowDeselect={false} data={DRAWER_HANDLE_OPTS} value={d.drawerHandle} onChange={(v) => v && setDefault({ drawerHandle: v as HandleType })} />
          </Row>
          <Row label="Door pull" info="A front can override this">
            <Select size="xs" w="100%" allowDeselect={false} data={DOOR_HANDLE_OPTS} value={d.doorHandle} onChange={(v) => v && setDefault({ doorHandle: v as HandleType })} />
          </Row>
        </div>
      </section>
    </div>
  );
}
