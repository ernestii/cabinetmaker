import { Badge, Checkbox, Chip, ColorInput, ColorSwatch, Drawer, Group, Input, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import type { Material, MaterialRole } from '../../domain/types';
import { InchInput } from '../components/InchInput';
import { TEXTURE_OPTIONS } from '../Viewer3D/textureOptions';
import { APPEARANCE_PRESETS, ROLE_META, SHEET_ROLES } from './meta';

interface Props {
  /** Material being edited; null keeps the drawer closed. */
  material: Material | null;
  onClose: () => void;
  setMat: (id: string, patch: Partial<Material>) => void;
  toggleRole: (id: string, role: MaterialRole) => void;
}

/** Small-caps section label inside the drawer. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fz="10px" fw={700} tt="uppercase" c="dimmed" mt={6} style={{ letterSpacing: '0.05em' }}>
      {children}
    </Text>
  );
}

/**
 * Right-side drawer holding every editable property of one material. Edits
 * write straight to the store (undo timeline covers mistakes), so closing the
 * drawer is always "done" — there's no save/cancel to get wrong.
 */
export function MaterialDrawer({ material, onClose, setMat, toggleRole }: Props) {
  const m = material;
  const isCounter = !!m?.roles.includes('counter');

  return (
    <Drawer
      opened={!!m}
      onClose={onClose}
      position="right"
      size={430}
      title={isCounter ? 'Edit countertop' : 'Edit sheet stock'}
    >
      {m && (
        <Stack gap={10}>
          <Group gap={8} wrap="nowrap" align="flex-end">
            <TextInput size="xs" flex={1} label="Name" value={m.name} autoComplete="off" spellCheck={false}
              onChange={(e) => setMat(m.id, { name: e.currentTarget.value })} />
            <ColorInput size="xs" w={132} label="Colour" format="hex" value={m.color}
              onChange={(v) => setMat(m.id, { color: v })} />
          </Group>
          {m.store && <Text fz="xs" c="dimmed">From {m.store}{m.sku ? ` · ${m.sku}` : ''}</Text>}

          <SectionLabel>Appearance</SectionLabel>
          <Group gap={6}>
            {APPEARANCE_PRESETS.map((p) => (
              <Tooltip key={p.label} label={p.label} withArrow position="top" openDelay={300}>
                <ColorSwatch component="button" color={p.color} size={24} radius="sm" aria-label={p.label}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setMat(m.id, { color: p.color, textureUrl: p.textureUrl, grained: p.grained })} />
              </Tooltip>
            ))}
          </Group>
          <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm" style={{ alignItems: 'end' }}>
            <Input.Wrapper label="Texture / finish" size="xs">
              <Select size="xs" w="100%" allowDeselect={false} data={TEXTURE_OPTIONS} value={m.textureUrl ?? ''}
                onChange={(v) => setMat(m.id, { textureUrl: v || undefined })} />
            </Input.Wrapper>
            <Checkbox size="xs" checked={m.grained} style={{ alignSelf: 'center' }}
              onChange={(e) => setMat(m.id, { grained: e.currentTarget.checked })}
              label={
                <Group component="span" gap={4} wrap="nowrap">
                  Has grain
                  <Tooltip multiline w={250} withArrow position="top" events={{ hover: true, focus: true, touch: true }}
                    label="Sheet has a visible grain direction. When on, parts keep their orientation while nesting (no 90° rotation) so the grain runs consistently. Turn off for grainless stock like MDF or melamine to let parts rotate and pack tighter.">
                    <Text span c="dimmed" style={{ cursor: 'help' }} onClick={(e) => e.preventDefault()}>ⓘ</Text>
                  </Tooltip>
                </Group>
              } />
          </SimpleGrid>

          <SectionLabel>Dimensions &amp; price</SectionLabel>
          <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm" style={{ alignItems: 'end' }}>
            <Input.Wrapper label="Thickness" size="xs">
              <InchInput value={m.thicknessIn} min={0.0625} step={0.0625} w="100%" suffix='"'
                onCommit={(v) => setMat(m.id, { thicknessIn: v })} />
            </Input.Wrapper>
            <Input.Wrapper label={isCounter ? 'Slab depth' : 'Sheet width'} size="xs">
              <InchInput value={m.sheetW} min={isCounter ? 6 : 12} w="100%" suffix='"'
                onCommit={(v) => setMat(m.id, { sheetW: v })} />
            </Input.Wrapper>
            <Input.Wrapper label={isCounter ? 'Slab length' : 'Sheet length'} size="xs">
              <InchInput value={m.sheetH} min={12} w="100%" suffix='"'
                onCommit={(v) => setMat(m.id, { sheetH: v })} />
            </Input.Wrapper>
            <Input.Wrapper label={isCounter ? 'Price / slab' : 'Price / sheet'} size="xs">
              <NumberInput size="xs" w="100%" min={0} prefix="$" decimalScale={2} value={m.pricePerSheet ?? 0}
                onChange={(v) => setMat(m.id, { pricePerSheet: Number(v) || 0 })} />
            </Input.Wrapper>
          </SimpleGrid>

          <SectionLabel>Used for</SectionLabel>
          {isCounter ? (
            <Group><Badge size="sm" variant="light">Countertops</Badge></Group>
          ) : (
            <Group gap={5}>
              {SHEET_ROLES.map((r) => (
                <Tooltip key={r} label={ROLE_META[r].hint} withArrow position="top" openDelay={300}>
                  <Chip size="xs" checked={m.roles.includes(r)} onChange={() => toggleRole(m.id, r)}>
                    {ROLE_META[r].label}
                  </Chip>
                </Tooltip>
              ))}
            </Group>
          )}

          {!isCounter && (
            <>
              <SectionLabel>Cutting settings</SectionLabel>
              <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm" style={{ alignItems: 'end' }}>
                <Input.Wrapper label="Saw kerf" size="xs">
                  <InchInput value={m.kerfIn} min={0} step={0.0625} w="100%" suffix='"'
                    onCommit={(v) => setMat(m.id, { kerfIn: v })} />
                </Input.Wrapper>
                <Input.Wrapper label="Edge trim" size="xs">
                  <InchInput value={m.edgeTrimIn ?? 0} min={0} step={0.0625} w="100%" suffix='"'
                    onCommit={(v) => setMat(m.id, { edgeTrimIn: v })} />
                </Input.Wrapper>
              </SimpleGrid>
              <Text c="dark.2" fz="xs">Also editable inline on the Cut List — same settings.</Text>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
