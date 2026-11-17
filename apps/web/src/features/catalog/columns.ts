import type { AssetModelDto, CategoryDto, LocationDto, StatusLabelDto } from '@inventarius/shared';
import type { CatalogItem } from './api';
import type { Section } from './entities';

type Translate = (key: string) => string;

/**
 * Columnas por sección. Las celdas de datos se llaman `name`, `second`, `third` y `fourth` para que
 * `CatalogPage` use una sola plantilla; `displayCells` dice qué va en cada una.
 */
export function columnsOf(section: Section, t: Translate) {
  const col = (id: string, key: string) => ({ id, header: t(`catalog.columns.${key}`) });
  const tail = [col('state', 'state'), { id: 'actions', header: t('common.actions') }];
  switch (section) {
    case 'categories':
      return [col('name', 'name'), col('second', 'extension'), ...tail];
    case 'manufacturers':
      return [col('name', 'name'), ...tail];
    case 'models':
      return [
        col('name', 'name'),
        col('second', 'modelNumber'),
        col('third', 'manufacturer'),
        col('fourth', 'category'),
        ...tail,
      ];
    case 'locations':
      return [col('name', 'path'), col('second', 'locationType'), col('third', 'address'), ...tail];
    case 'statuses':
      return [col('name', 'name'), col('second', 'kind'), ...tail];
  }
}

export interface DisplayCells {
  title: string;
  second: string;
  third: string;
  fourth: string;
}

/** Texto de cada celda; los valores enumerados se devuelven como claves i18n ya resueltas por el llamador. */
export function displayCells(section: Section, item: CatalogItem, t?: Translate): DisplayCells {
  const tr = (key: string) => (t ? t(key) : key);
  switch (section) {
    case 'categories':
      return {
        title: item.name,
        second: tr(`catalog.extensions.${(item as CategoryDto).extension}`),
        third: '',
        fourth: '',
      };
    case 'models': {
      const m = item as AssetModelDto;
      return {
        title: m.name,
        second: m.modelNumber ?? '',
        third: m.manufacturer.name,
        fourth: m.category.name,
      };
    }
    case 'locations': {
      const l = item as LocationDto;
      return {
        title: l.path,
        second: tr(`catalog.locationTypes.${l.type}`),
        third: l.address ?? '',
        fourth: '',
      };
    }
    case 'statuses':
      return {
        title: item.name,
        second: tr(`catalog.kinds.${(item as StatusLabelDto).kind}`),
        third: '',
        fourth: '',
      };
    default:
      return { title: item.name, second: '', third: '', fourth: '' };
  }
}
