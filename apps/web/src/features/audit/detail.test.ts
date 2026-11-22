import { describe, expect, it } from 'vitest';
import { messages } from '@/app/i18n/es-CL';
import { setFormatSettings } from '@/shared/format/format';
import { describeAuditDetail, formatDetailValue, type DetailText } from './detail';

/** Resuelve «a.b.c» contra los textos reales, como vue-i18n. */
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);
const text: DetailText = {
  t: (k) => String(lookup(k)),
  te: (k) => typeof lookup(k) === 'string',
};

setFormatSettings({ timezone: 'America/Santiago', defaultCurrency: 'CLP' });

describe('describeAuditDetail (RF-31)', () => {
  it('sin diff no hay filas', () => {
    expect(describeAuditDetail(null, text)).toEqual([]);
  });

  it('antes y después: solo lo que cambió, con nombres en español', () => {
    const rows = describeAuditDetail(
      {
        before: { name: 'Ana', active: true, roles: ['Lector'] },
        after: { name: 'Ana María', active: true, roles: ['Operador', 'Lector'] },
      },
      text,
    );
    expect(rows).toEqual([
      { field: 'name', label: 'Nombre', before: 'Ana', after: 'Ana María' },
      { field: 'roles', label: 'Roles', before: 'Lector', after: 'Operador, Lector' },
    ]);
  });

  it('un alta (solo after) lista campo → valor; booleanos y vacíos en lenguaje de persona', () => {
    const rows = describeAuditDetail(
      {
        after: {
          name: 'Sensor',
          active: true,
          address: null,
          kind: 'deployable',
          type: 'warehouse',
        },
      },
      text,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Nombre', 'Sensor'],
      ['Activo', 'Sí'],
      ['Dirección', '—'],
      ['Tipo de estado', 'Asignable'],
      ['Tipo', 'Bodega'],
    ]);
  });

  it('una baja (solo before) y un objeto plano también se listan', () => {
    expect(describeAuditDetail({ before: { name: 'Rol X' } }, text)).toEqual([
      { field: 'name', label: 'Nombre', value: 'Rol X' },
    ]);
    expect(describeAuditDetail({ email: 'x@ejemplo.cl' }, text)).toEqual([
      { field: 'email', label: 'Correo electrónico', value: 'x@ejemplo.cl' },
    ]);
  });

  it('traduce permisos y formatea fechas', () => {
    expect(formatDetailValue('permissions', ['asset:read', 'audit:read'], text)).toBe(
      'Ver activos, Ver auditoría',
    );
    expect(formatDetailValue('purchaseDate', '2026-11-05', text)).toBe('05-11-2026');
    expect(formatDetailValue('permissions', [], text)).toBe('—');
  });

  it('traduce los valores enumerados, no solo los nombres de campo [P29]', () => {
    const rows = describeAuditDetail(
      { after: { assignedTo: 'Ana', assignedToType: 'user', kind: 'undeployable' } },
      text,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Asignado a', 'Ana'],
      ['Tipo de destino', 'Usuario'],
      ['Tipo de estado', 'No asignable'],
    ]);
    expect(formatDetailValue('assignedToType', 'location', text)).toBe('Ubicación');
    expect(formatDetailValue('lorawanClass', 'C', text)).not.toBe('C');
  });

  it('la baja muestra situación antes/después, motivo y el estado como contexto [P40]', () => {
    const rows = describeAuditDetail(
      {
        before: { situation: 'vigente' },
        after: { situation: 'baja', reason: 'Equipo robado' },
        context: { status: 'Disponible' },
      },
      text,
    );
    expect(rows).toEqual([
      { field: 'situation', label: 'Situación', before: 'Vigente', after: 'Dado de baja' },
      { field: 'reason', label: 'Motivo', value: 'Equipo robado' },
      { field: 'status', label: 'Estado', value: 'Disponible' },
    ]);
  });

  it('los datos del evento y el contexto son valor simple; antes → después solo si el valor cambió [P43]', () => {
    const rows = describeAuditDetail(
      {
        before: { status: 'Disponible', assignedTo: null, name: 'Igual' },
        after: {
          status: 'Asignado',
          assignedTo: 'Ana',
          assignedToType: 'user',
          note: 'sale a terreno',
          expectedReturnOn: null,
          name: 'Igual',
        },
        context: { location: 'Bodega Norte' },
      },
      text,
    );
    expect(rows).toEqual([
      { field: 'status', label: 'Estado', before: 'Disponible', after: 'Asignado' },
      { field: 'assignedTo', label: 'Asignado a', value: 'Ana' },
      { field: 'assignedToType', label: 'Tipo de destino', value: 'Usuario' },
      { field: 'note', label: 'Nota', value: 'sale a terreno' },
      { field: 'location', label: 'Ubicación', value: 'Bodega Norte' },
    ]);
    // Nada con «Antes»/«Después» salvo lo que cambió de valor.
    expect(rows.filter((r) => r.before !== undefined).map((r) => r.field)).toEqual(['status']);
  });

  it('una restauración muestra el motivo de la baja como valor simple', () => {
    const rows = describeAuditDetail(
      {
        before: { situation: 'baja', reason: 'Equipo robado' },
        after: { situation: 'vigente' },
        context: { status: 'Disponible' },
      },
      text,
    );
    expect(rows).toEqual([
      { field: 'situation', label: 'Situación', before: 'Dado de baja', after: 'Vigente' },
      { field: 'reason', label: 'Motivo', value: 'Equipo robado' },
      { field: 'status', label: 'Estado', value: 'Disponible' },
    ]);
  });

  it('un campo desconocido se muestra con su clave en lugar de perderse', () => {
    expect(describeAuditDetail({ after: { campoNuevo: 'x' } }, text)[0]).toMatchObject({
      label: 'campoNuevo',
      value: 'x',
    });
  });

  describe('LoRaWAN y LNS (P8): ni claves internas ni valores crudos', () => {
    /** Ninguna fila debe contener un código interno ni un valor técnico crudo. */
    const raw = [
      /devEui|joinEui|deviceClass|lorawanVersion|externalId|deviceDefaults|appKeyChanged|hasAppKey/,
      /\b(true|false|linked|created)\b/,
    ];
    const show = (rows: ReturnType<typeof describeAuditDetail>) =>
      rows
        .map((r) => [r.label, r.value, r.before, r.after].filter((x) => x !== undefined).join(' '))
        .join('\n');

    it('edición de datos LoRaWAN: campos, valores y la línea «AppKey: cargada»', () => {
      const rows = describeAuditDetail(
        {
          before: { devEui: null, hasAppKey: false, region: null, deviceClass: 'A' },
          after: {
            devEui: '70B3D57ED0000001',
            hasAppKey: true,
            appKeyChanged: true,
            region: 'AU915',
            deviceClass: 'C',
            lorawanVersion: '1.0.3',
            batchId: '0190a1b2-0000-7000-8000-000000000001',
          },
        },
        text,
        { entity: 'asset' },
      );
      expect(rows.find((r) => r.field === 'appKey')).toEqual({
        field: 'appKey',
        label: 'AppKey',
        value: 'cargada',
      });
      expect(rows.some((r) => r.field === 'hasAppKey' || r.field === 'appKeyChanged')).toBe(false);
      expect(rows.find((r) => r.field === 'devEui')).toMatchObject({
        label: 'DevEUI',
        before: '—',
      });
      expect(rows.find((r) => r.field === 'region')).toMatchObject({ label: 'Región' });
      expect(rows.find((r) => r.field === 'deviceClass')!.after).not.toBe('C');
      expect(rows.find((r) => r.field === 'lorawanVersion')!.after).toBe('LoRaWAN 1.0.3');
      const out = show(rows);
      for (const re of raw) expect(out).not.toMatch(re);
    });

    it('si solo se escribió la clave: «AppKey: actualizada»; NwkKey igual', () => {
      const rows = describeAuditDetail(
        { before: {}, after: { appKeyChanged: true, nwkKeyChanged: true } },
        text,
      );
      expect(rows).toEqual([
        { field: 'appKey', label: 'AppKey', value: 'actualizada' },
        { field: 'nwkKey', label: 'NwkKey', value: 'actualizada' },
      ]);
    });

    it('registro, vínculo y fallo: perfil, id, origen, huérfanos y error en español', () => {
      const linked = describeAuditDetail(
        {
          after: {
            profile: 'ChirpStack de prueba',
            externalId: '70b3d57ed0000001',
            origin: 'linked',
          },
        },
        text,
      );
      expect(show(linked)).toContain('Perfil LNS ChirpStack de prueba');
      expect(show(linked)).toContain('Id en el LNS 70b3d57ed0000001');
      expect(show(linked)).toContain('Origen Vinculado');
      const failed = describeAuditDetail(
        { after: { profile: 'TTN', error: 'No se pudo conectar', orphans: ['device', 'js'] } },
        text,
      );
      expect(show(failed)).toContain('Componentes huérfanos Dispositivo, Join Server');
      expect(show(failed)).not.toMatch(/\bjs\b/);
    });

    it('importación: las series se listan y, si son muchas, se resumen', () => {
      const serials = Array.from({ length: 25 }, (_, i) => `SN-${i + 1}`);
      const rows = describeAuditDetail({ after: { count: 25, serials } }, text);
      const value = rows.find((r) => r.field === 'serials')!.value!;
      expect(rows.find((r) => r.field === 'serials')!.label).toBe('Números de serie');
      expect(value).toContain('SN-10');
      expect(value).not.toContain('SN-11');
      expect(value).toContain('y 15 más');
    });

    it('perfil LNS: «Tipo de LNS», valor «ChirpStack», destino y valores por defecto legibles', () => {
      const rows = describeAuditDetail(
        {
          after: {
            kind: 'chirpstack',
            tls: false,
            target: { tenantId: 'T-1', applicationId: 'A-1' },
            deviceDefaults: { deviceProfileId: 'D-1' },
          },
        },
        text,
        { entity: 'lns_profile' },
      );
      expect(rows.find((r) => r.field === 'kind')).toEqual({
        field: 'kind',
        label: 'Tipo de LNS',
        value: 'ChirpStack',
      });
      expect(rows.find((r) => r.field === 'target')!.value).toBe('Tenant: T-1; Aplicación: A-1');
      expect(rows.find((r) => r.field === 'deviceDefaults')!.value).toBe('Device profile: D-1');
      expect(rows.find((r) => r.field === 'tls')!.value).toBe('No');
      const out = show(rows);
      for (const re of raw) expect(out).not.toMatch(re);
    });

    it('revelado de claves: nombres de las claves, no sus códigos', () => {
      const rows = describeAuditDetail({ keys: ['appKey', 'nwkKey'] }, text);
      expect(rows).toEqual([{ field: 'keys', label: 'Claves reveladas', value: 'AppKey, NwkKey' }]);
    });
  });
});

describe('consumibles: movimientos sin claves crudas', () => {
  it('muestra cantidades con coma decimal y el motivo del ajuste traducido', () => {
    const rows = describeAuditDetail(
      {
        location: 'Bodega central',
        direction: 'subtract',
        quantity: '2.5',
        unit: 'litro',
        reason: 'waste_damage',
        stockBefore: '1234.5',
        stockAfter: '1232',
      },
      text,
      { entity: 'consumable' },
    );
    const by = Object.fromEntries(rows.map((r) => [r.field, r.value]));
    expect(by['quantity']).toBe('2,5');
    expect(by['stockBefore']).toBe('1.234,5');
    expect(by['direction']).toBe('Resta');
    expect(by['reason']).toBe('Merma o daño');
    expect(by['location']).toBe('Bodega central');
  });
});

describe('consumibles: anulación con el detalle del movimiento anulado (P3)', () => {
  it('traduce el motivo original, muestra las fechas y el saldo del origen y del destino', () => {
    const rows = describeAuditDetail(
      {
        originalKind: 'transfer_out',
        quantity: '3',
        unit: 'par',
        fromLocation: 'Bodega central',
        toLocation: 'Bodega anexo',
        fromStockBefore: '1234.5',
        toStockBefore: '3',
        originalReason: 'loss',
        originalNote: 'Se cayó la caja',
        reversalReason: 'Error de bodega',
        originalActor: 'Olga Operadora',
        movementDate: '2026-11-18',
        registeredAt: '2026-11-20T15:30:00.000Z',
      },
      text,
      { entity: 'consumable' },
    );
    const by = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(by['Movimiento anulado']).toBe('Traslado');
    expect(by['Saldo del origen antes']).toBe('1.234,5');
    expect(by['Saldo del destino antes']).toBe('3');
    expect(by['Motivo del movimiento']).toBe('Pérdida');
    expect(by['Nota del movimiento']).toBe('Se cayó la caja');
    expect(by['Motivo de la anulación']).toBe('Error de bodega');
    expect(by['Registrado por']).toBe('Olga Operadora');
    expect(by['Fecha del movimiento']).toBe('18-11-2026');
    expect(by['Registrado el']).toBe('20-11-2026 12:30');
  });
});

describe('consumibles: orden fijo de campos y «Bodega» (P11)', () => {
  const labels = (diff: Record<string, unknown>) =>
    describeAuditDetail(diff, text, { entity: 'consumable' }).map((r) => r.label);

  it('muestra tipo, cantidad, unidad, bodega, saldos, receptor, motivo, nota y fechas, aunque lleguen desordenados', () => {
    // Postgres devuelve el jsonb con las claves en otro orden: el orden de lectura lo pone la web.
    expect(
      labels({
        registeredAt: '2026-11-20T15:30:00.000Z',
        note: 'Cambio de turno',
        stockAfter: '6',
        unit: 'par',
        recipient: 'Persona Inventada',
        stockBefore: '10',
        location: 'Bodega central',
        quantity: '4',
        receivedOn: '2026-11-18',
      }),
    ).toEqual([
      'Cantidad',
      'Unidad',
      'Bodega',
      'Saldo antes',
      'Saldo después',
      'Recibe',
      'Nota',
      'Fecha del ingreso',
      'Registrado el',
    ]);
  });

  it('un traslado usa origen y destino con sus saldos, y una anulación pone el tipo primero', () => {
    expect(
      labels({
        toStockAfter: '4',
        reversalReason: 'Error',
        fromLocation: 'Bodega central',
        quantity: '4',
        toStockBefore: '0',
        originalKind: 'transfer_out',
        fromStockAfter: '10',
        toLocation: 'Bodega anexo',
        fromStockBefore: '6',
        unit: 'par',
      }),
    ).toEqual([
      'Movimiento anulado',
      'Motivo de la anulación',
      'Cantidad',
      'Unidad',
      'Bodega de origen',
      'Bodega de destino',
      'Saldo del origen antes',
      'Saldo del origen después',
      'Saldo del destino antes',
      'Saldo del destino después',
    ]);
  });

  it('en los eventos de consumibles la ubicación se llama «Bodega»; en el resto, no', () => {
    expect(labels({ location: 'Bodega central' })).toEqual(['Bodega']);
    const other = describeAuditDetail({ location: 'Sala 1' }, text, { entity: 'asset' });
    expect(other[0]!.label).not.toBe('Bodega');
  });
});

describe('consumibles: la persona de una devolución «Devolvió» (D1)', () => {
  const label = (diff: Record<string, unknown>, action: string) =>
    describeAuditDetail(diff, text, { entity: 'consumable', action }).find(
      (r) => r.field === 'recipient',
    )?.label;

  it('el evento de devolución y la anulación de una devolución dicen «Devolvió»', () => {
    expect(label({ recipient: 'Ana Inventada' }, 'consumable.return')).toBe('Devolvió');
    expect(
      label({ originalKind: 'return', recipient: 'Ana Inventada' }, 'consumable.reverse'),
    ).toBe('Devolvió');
  });

  it('la entrega y la anulación de una entrega siguen diciendo «Recibe»', () => {
    expect(label({ recipient: 'Ana Inventada' }, 'consumable.deliver')).toBe('Recibe');
    expect(
      label({ originalKind: 'delivery', recipient: 'Ana Inventada' }, 'consumable.reverse'),
    ).toBe('Recibe');
  });
});

describe('consumibles: a qué entrega pertenece una devolución (D10)', () => {
  it('la muestra como «Entrega del dd-mm-aaaa HH:mm a <receptor>», en la hora de la instalación', () => {
    const rows = describeAuditDetail(
      {
        quantity: '1',
        recipient: 'Ana Inventada',
        delivery: { at: '2026-11-16T15:30:00.000Z', recipient: 'Ana Inventada' },
        note: 'Sobró',
      },
      text,
      { entity: 'consumable', action: 'consumable.return' },
    );
    const delivery = rows.find((r) => r.field === 'delivery')!;
    expect(delivery.label).toBe('Entrega');
    expect(delivery.value).toBe('Entrega del 16-11-2026 12:30 a Ana Inventada');
    // Va junto a la persona, antes de la nota.
    const order = rows.map((r) => r.field);
    expect(order.indexOf('delivery')).toBe(order.indexOf('recipient') + 1);
    expect(order.indexOf('delivery')).toBeLessThan(order.indexOf('note'));
  });

  it('el título de una anulación de traslado dice «Traslado» y su motivo va primero', () => {
    const rows = describeAuditDetail(
      { originalKind: 'transfer_in', quantity: '2', reversalReason: 'Error' },
      text,
      { entity: 'consumable', action: 'consumable.reverse' },
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Movimiento anulado', 'Traslado'],
      ['Motivo de la anulación', 'Error'],
      ['Cantidad', '2'],
    ]);
  });
});
