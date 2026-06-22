import { describe, expect, it } from 'vitest';
import { CATALOG, catalogProduct, materialFromProduct, sheetProducts, countertopProducts } from '../catalog';
import { TEXTURE_OPTIONS } from '../../ui/Viewer3D/materialTexture';

const TEXTURE_VALUES = new Set(TEXTURE_OPTIONS.map((o) => o.value).filter(Boolean));

describe('product catalog', () => {
  it('has unique ids', () => {
    const ids = CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product is well-formed and shoppable', () => {
    for (const p of CATALOG) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.thicknessIn).toBeGreaterThan(0);
      expect(p.sheetW).toBeGreaterThan(0);
      expect(p.sheetH).toBeGreaterThanOrEqual(p.sheetW); // length is the long side
      expect(p.roles.length).toBeGreaterThan(0);
      expect(p.store).toBeTruthy();
      if (p.textureUrl) expect(TEXTURE_VALUES.has(p.textureUrl)).toBe(true);
    }
  });

  it('splits cleanly into sheet vs countertop, with counters carrying the counter role', () => {
    expect(sheetProducts.length).toBeGreaterThan(0);
    expect(countertopProducts.length).toBeGreaterThan(0);
    expect(sheetProducts.every((p) => !p.roles.includes('counter'))).toBe(true);
    expect(countertopProducts.every((p) => p.roles.includes('counter'))).toBe(true);
  });

  it('materialFromProduct carries the price + provenance onto the material', () => {
    const p = catalogProduct('bb-birch-8')!;
    const m = materialFromProduct(p, 'mat-1');
    expect(m.id).toBe('mat-1');
    expect(m.pricePerSheet).toBe(p.price);
    expect(m.productId).toBe(p.id);
    expect(m.sku).toBe(p.sku);
    expect(m.roles).toEqual(p.roles);
    // editing the material's roles must not mutate the catalog product
    m.roles.push('toekick');
    expect(p.roles).not.toContain('toekick');
  });
});
