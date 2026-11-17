import type { CatalogItem } from './api';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import type {
  AssetModelDto,
  CategoryExtension,
  LocationDto,
  StatusLabelDto,
} from '@inventarius/shared';

export const SECTIONS = ['categories', 'manufacturers', 'models', 'locations', 'statuses'] as const;
export type Section = (typeof SECTIONS)[number];

/** Valor de un campo del formulario: texto, interruptor o referencia elegida en un `RemoteSelect`. */
export type FormValue = string | boolean | RemoteOption | null;
export type FormState = Record<string, FormValue>;

export interface FieldDef {
  key: string;
  /** Clave i18n del rótulo. */
  label: string;
  kind: 'text' | 'select' | 'ref';
  required?: boolean;
  maxLength?: number;
  /** Clave i18n de un texto de ayuda bajo el campo. */
  help?: string;
  /** Para `select`: valores y su clave i18n. */
  options?: { value: string; label: string }[];
  /** Para `ref`: de qué sección se elige. */
  source?: Section;
  /** Solo se muestra si devuelve `true` (p. ej. campos LoRaWAN según la categoría). */
  when?: (form: FormState) => boolean;
}

const text = (key: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label: `catalog.fields.${key}`,
  kind: 'text',
  ...extra,
});

const isLora = (form: FormState): boolean =>
  (form['category'] as RemoteOption | null)?.['extension'] === 'lorawan';

const FIELDS: Record<Section, FieldDef[]> = {
  categories: [
    text('name', { required: true, maxLength: 120 }),
    {
      key: 'extension',
      label: 'catalog.fields.extension',
      kind: 'select',
      required: true,
      options: [
        { value: 'none', label: 'catalog.extensions.none' },
        { value: 'lorawan', label: 'catalog.extensions.lorawan' },
      ],
    },
  ],
  manufacturers: [text('name', { required: true, maxLength: 120 })],
  models: [
    text('name', { required: true, maxLength: 120 }),
    text('modelNumber', { maxLength: 80, help: 'catalog.help.modelNumber' }),
    {
      key: 'manufacturer',
      label: 'catalog.fields.manufacturer',
      kind: 'ref',
      source: 'manufacturers',
      required: true,
    },
    {
      key: 'category',
      label: 'catalog.fields.category',
      kind: 'ref',
      source: 'categories',
      required: true,
    },
    {
      key: 'lorawanClass',
      label: 'catalog.fields.lorawanClass',
      kind: 'select',
      when: isLora,
      options: [
        { value: '', label: 'common.none' },
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
        { value: 'C', label: 'C' },
      ],
    },
    text('lorawanVersion', { maxLength: 20, when: isLora }),
    text('lorawanRegionalParameters', { maxLength: 20, when: isLora }),
  ],
  locations: [
    text('name', { required: true, maxLength: 120 }),
    { key: 'parent', label: 'catalog.fields.parent', kind: 'ref', source: 'locations' },
    text('address', { maxLength: 240 }),
  ],
  statuses: [
    text('name', { required: true, maxLength: 120 }),
    {
      key: 'kind',
      label: 'catalog.fields.kind',
      kind: 'select',
      required: true,
      options: (['deployable', 'pending', 'undeployable', 'archived'] as const).map((k) => ({
        value: k,
        label: `catalog.kinds.${k}`,
      })),
    },
  ],
};

export const fieldsOf = (section: Section): FieldDef[] => FIELDS[section];

/** Campos que corresponde mostrar con el estado actual del formulario. */
export function visibleFields(section: Section, form: FormState): FieldDef[] {
  return FIELDS[section].filter((f) => !f.when || f.when(form));
}

const DEFAULTS: Record<Section, FormState> = {
  categories: { name: '', extension: 'none', active: true },
  manufacturers: { name: '', active: true },
  models: {
    name: '',
    modelNumber: '',
    manufacturer: null,
    category: null,
    lorawanClass: '',
    lorawanVersion: '',
    lorawanRegionalParameters: '',
    active: true,
  },
  locations: { name: '', parent: null, address: '', active: true },
  statuses: { name: '', kind: 'deployable', active: true },
};

export const emptyForm = (section: Section): FormState => ({ ...DEFAULTS[section] });

const ref = (r: { id: string; name: string } | null, extra: Record<string, unknown> = {}) =>
  r ? ({ id: r.id, name: r.name, ...extra } as RemoteOption) : null;

/** Formulario de edición a partir del registro. */
export function formFromItem(section: Section, item: CatalogItem): FormState {
  switch (section) {
    case 'models': {
      const m = item as AssetModelDto;
      return {
        name: m.name,
        modelNumber: m.modelNumber ?? '',
        manufacturer: ref(m.manufacturer),
        category: ref(m.category, { extension: m.category.extension satisfies CategoryExtension }),
        lorawanClass: m.lorawanClass ?? '',
        lorawanVersion: m.lorawanVersion ?? '',
        lorawanRegionalParameters: m.lorawanRegionalParameters ?? '',
        active: m.active,
      };
    }
    case 'locations': {
      const l = item as LocationDto;
      return { name: l.name, parent: ref(l.parent), address: l.address ?? '', active: l.active };
    }
    case 'statuses': {
      const s = item as StatusLabelDto;
      return { name: s.name, kind: s.kind, active: s.active };
    }
    case 'categories': {
      const c = item as CatalogItem & { extension: string };
      return { name: c.name, extension: c.extension, active: c.active };
    }
    default:
      return { name: item.name, active: item.active };
  }
}

const str = (v: FormValue | undefined): string => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: FormValue | undefined): string | null => str(v) || null;
const idOf = (v: FormValue | undefined): string | null =>
  v && typeof v === 'object' ? v.id : null;

/** Cuerpo de la petición. En alta no se manda `active` (nace activo). */
export function toPayload(
  section: Section,
  form: FormState,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  const active = mode === 'edit' ? { active: form['active'] === true } : {};
  switch (section) {
    case 'categories':
      return { name: str(form['name']), extension: str(form['extension']), ...active };
    case 'manufacturers':
      return { name: str(form['name']), ...active };
    case 'models': {
      const lora = isLora(form);
      return {
        name: str(form['name']),
        modelNumber: orNull(form['modelNumber']),
        manufacturerId: idOf(form['manufacturer']),
        categoryId: idOf(form['category']),
        lorawanClass: lora ? orNull(form['lorawanClass']) : null,
        lorawanVersion: lora ? orNull(form['lorawanVersion']) : null,
        lorawanRegionalParameters: lora ? orNull(form['lorawanRegionalParameters']) : null,
        ...active,
      };
    }
    case 'locations':
      return {
        name: str(form['name']),
        parentId: idOf(form['parent']),
        address: orNull(form['address']),
        ...active,
      };
    case 'statuses':
      return { name: str(form['name']), kind: str(form['kind']), ...active };
  }
}
