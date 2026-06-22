import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  Input,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
} from '@mantine/core';
import { useStore } from '../state/store';
import { buildNewProject, defaultMaterialIds, projectDefaults, SHEET_PRESETS } from '../domain/seed';
import type { BackStyle, DrawerJoint, HandleType, SlideType } from '../domain/types';
import {
  BACK_STYLE_OPTS,
  DOOR_HANDLE_OPTS,
  DRAWER_HANDLE_OPTS,
  DRAWER_JOINT_OPTS,
  labelOf,
  SLIDE_TYPE_OPTS,
} from './constructionOptions';
import { InchInput } from './components/InchInput';
import { toFraction } from '../domain/format';

/** Labelled cell wrapping a custom InchInput. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Input.Wrapper label={label}>
      <Box mt={4}>{children}</Box>
    </Input.Wrapper>
  );
}

const STEP_COUNT = 5;
const LAST_STEP = STEP_COUNT - 1;

export function NewProjectWizard({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const setProject = useStore((s) => s.setProject);
  const setView = useStore((s) => s.setView);
  const select = useStore((s) => s.select);

  const d0 = projectDefaults();
  const [active, setActive] = useState(0);
  const [name, setName] = useState('My Kitchen');

  // Dimensions
  const [length, setLength] = useState(144);
  const [ceiling, setCeiling] = useState(96);
  const [counterH, setCounterH] = useState(d0.counterHeightIn);
  const [upperH, setUpperH] = useState(d0.upperHeightIn);
  const [baseDepth, setBaseDepth] = useState(d0.baseDepthIn);

  // Drawer & construction defaults
  const [drawerJoint, setDrawerJoint] = useState<DrawerJoint>(d0.drawerJoint);
  const [drawerHandle, setDrawerHandle] = useState<HandleType>(d0.drawerHandle);
  const [doorHandle, setDoorHandle] = useState<HandleType>(d0.doorHandle);
  const [slideType, setSlideType] = useState<SlideType>(d0.slideType);
  const [backStyle, setBackStyle] = useState<BackStyle>(d0.backStyle);
  const [dadoDepth, setDadoDepth] = useState(d0.dadoDepthIn);

  // Materials
  const [materialIds, setMaterialIds] = useState<string[]>(defaultMaterialIds());
  const toggleMaterial = (id: string) =>
    setMaterialIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const reset = () => setActive(0);
  const close = () => {
    reset();
    onClose();
  };
  const create = () => {
    setProject(
      buildNewProject({
        name,
        lengthIn: length,
        ceilingHeightIn: ceiling,
        defaults: {
          counterHeightIn: counterH,
          upperHeightIn: upperH,
          baseDepthIn: baseDepth,
          drawerJoint,
          drawerHandle,
          doorHandle,
          slideType,
          backStyle,
          dadoDepthIn: dadoDepth,
        },
        materialIds,
      }),
    );
    setView('layout');
    select(undefined);
    close();
  };

  const selectedSheets = SHEET_PRESETS.filter((p) => materialIds.includes(p.id));

  return (
    <Modal opened={opened} onClose={close} title="New project" size="lg" centered>
      <Stepper active={active} onStepClick={setActive} size="sm">
        <Stepper.Step label="Project" description="Name it">
          <TextInput
            mt="md"
            label="Project name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="My Kitchen"
            data-autofocus
          />
        </Stepper.Step>

        <Stepper.Step label="Dimensions" description="Wall & heights">
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="md">
            <Cell label="Wall length"><InchInput value={length} min={24} w={120} suffix='"' onCommit={setLength} /></Cell>
            <Cell label="Ceiling height"><InchInput value={ceiling} min={60} w={120} suffix='"' onCommit={setCeiling} /></Cell>
            <Cell label="Counter height"><InchInput value={counterH} min={28} max={42} w={120} suffix='"' onCommit={setCounterH} /></Cell>
            <Cell label="Upper height"><InchInput value={upperH} min={12} w={120} suffix='"' onCommit={setUpperH} /></Cell>
            <Cell label="Base depth"><InchInput value={baseDepth} min={9} w={120} suffix='"' onCommit={setBaseDepth} /></Cell>
          </SimpleGrid>
          <Text size="xs" c="dimmed" mt="sm">
            A single run of cabinets along one wall — add sections in the layout editor.
          </Text>
        </Stepper.Step>

        <Stepper.Step label="Construction" description="Drawers & backs">
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="md">
            <Select label="Drawer joint" allowDeselect={false} data={DRAWER_JOINT_OPTS} value={drawerJoint}
              onChange={(v) => v && setDrawerJoint(v as DrawerJoint)} />
            <Select label="Drawer pull" allowDeselect={false} data={DRAWER_HANDLE_OPTS} value={drawerHandle}
              onChange={(v) => v && setDrawerHandle(v as HandleType)} />
            <Select label="Door pull" allowDeselect={false} data={DOOR_HANDLE_OPTS} value={doorHandle}
              onChange={(v) => v && setDoorHandle(v as HandleType)} />
            <Select label="Slide type" allowDeselect={false} data={SLIDE_TYPE_OPTS} value={slideType}
              onChange={(v) => v && setSlideType(v as SlideType)} />
            <Select label="Cabinet back" allowDeselect={false} data={BACK_STYLE_OPTS} value={backStyle}
              onChange={(v) => v && setBackStyle(v as BackStyle)} />
            <Cell label="Dado depth"><InchInput value={dadoDepth} min={0.0625} step={0.0625} w={120} suffix='"' onCommit={setDadoDepth} /></Cell>
          </SimpleGrid>
          <Text size="xs" c="dimmed" mt="sm">
            Project-wide defaults — any cabinet or front can override them later.
          </Text>
        </Stepper.Step>

        <Stepper.Step label="Materials" description="Sheet stock">
          <Text size="sm" mt="md">Pick the sheet goods you'll cut from. The first sheet carrying each role is used for it.</Text>
          <ScrollArea.Autosize mah={280} mt="xs">
            <Stack gap={6} pr="sm">
              {SHEET_PRESETS.map((p) => (
                <Checkbox
                  key={p.id}
                  checked={materialIds.includes(p.id)}
                  onChange={() => toggleMaterial(p.id)}
                  label={
                    <span>
                      <Text component="span" fw={500}>{p.name}</Text>
                      <Text component="span" size="xs" c="dimmed"> — {p.hint} · ${p.pricePerSheet}/sheet</Text>
                    </span>
                  }
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {materialIds.length === 0 && (
            <Text size="xs" c="orange" mt="xs">No sheets selected — parts will fall back to generic stock. You can add materials later.</Text>
          )}
        </Stepper.Step>

        <Stepper.Completed>
          <Stack gap={4} mt="md">
            <Text fw={600}>Ready to build</Text>
            <SummaryRow label="Project" value={name.trim() || 'New Project'} />
            <SummaryRow label="Wall" value={`${toFraction(length)} long × ${toFraction(ceiling)} ceiling`} />
            <SummaryRow label="Counter / upper" value={`${toFraction(counterH)} counter · ${toFraction(upperH)} upper · ${toFraction(baseDepth)} deep base`} />
            <SummaryRow label="Drawers" value={`${labelOf(DRAWER_JOINT_OPTS, drawerJoint)} · ${labelOf(SLIDE_TYPE_OPTS, slideType)} slides · ${labelOf(DRAWER_HANDLE_OPTS, drawerHandle)}`} />
            <SummaryRow label="Doors / backs" value={`${labelOf(DOOR_HANDLE_OPTS, doorHandle)} · ${labelOf(BACK_STYLE_OPTS, backStyle)} back`} />
            <SummaryRow label="Materials" value={selectedSheets.length ? selectedSheets.map((p) => p.name).join(', ') : 'generic stock'} />
          </Stack>
        </Stepper.Completed>
      </Stepper>

      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={close}>Cancel</Button>
        <Group gap="sm">
          {active > 0 && <Button variant="default" onClick={() => setActive((a) => a - 1)}>Back</Button>}
          {active < LAST_STEP
            ? <Button onClick={() => setActive((a) => a + 1)}>Next</Button>
            : <Button onClick={create}>Create project</Button>}
        </Group>
      </Group>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="sm" c="dimmed" w={120} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}
