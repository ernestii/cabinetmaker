import { Badge, Button, Modal, Text } from '@mantine/core';
import { CATALOG, type CatalogProduct } from '../../domain/catalog';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Called with the chosen product; the parent turns it into a Material. */
  onAdd: (product: CatalogProduct) => void;
  /** Show only one product group (the section the picker was opened from). */
  category?: CatalogProduct['category'];
}

const GROUPS: { category: CatalogProduct['category']; title: string; blurb: string }[] = [
  { category: 'sheet', title: 'Sheet goods', blurb: 'Plywood, MDF & melamine — 4×8 sheets the cut list nests parts onto.' },
  { category: 'countertop', title: 'Countertops', blurb: 'Butcher block & slabs cut to length over your base runs.' },
];

/**
 * Pick a real, priced product to add as a project material. Grouped by sheet
 * goods vs countertops; prices are planning ballparks (see the catalog).
 */
export function CatalogPicker({ opened, onClose, onAdd, category }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add stock from the catalog" size="lg" centered>
      <Text size="xs" c="dimmed" mb="md">
        Generic material types (no brand affiliation). Prices are ballpark estimates for planning — adjust
        anything after adding it.
      </Text>
      {GROUPS.filter((g) => !category || g.category === category).map((g) => (
        <div key={g.category} className="catalog-group">
          <h4 className="catalog-group-title">{g.title}</h4>
          <Text c="dark.1" fz="xs">{g.blurb}</Text>
          <div className="catalog-list">
            {CATALOG.filter((p) => p.category === g.category).map((p) => (
              <div key={p.id} className="catalog-item">
                <span className="catalog-swatch" style={{ background: p.color }} aria-hidden />
                <div className="catalog-item-body">
                  <div className="catalog-item-head">
                    <span className="catalog-item-name">{p.name}</span>
                    <span className="catalog-item-price">${p.price}</span>
                  </div>
                  <div className="catalog-item-meta">
                    {p.roles.map((r) => (
                      <Badge key={r} size="xs" variant="light" color="gray">{r}</Badge>
                    ))}
                    <span className="catalog-item-note">{p.note}</span>
                  </div>
                </div>
                <Button size="xs" variant="default" onClick={() => { onAdd(p); onClose(); }}>Add</Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
