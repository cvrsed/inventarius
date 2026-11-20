import { describe, expect, it } from 'vitest';
import { createLnsProfileSchema } from '@inventarius/shared';
import { profileBody, type ProfileForm } from './form';

const chirp: ProfileForm = {
  kind: 'chirpstack',
  name: ' Principal ',
  description: '',
  endpoint: 'chirpstack.example.test:8080',
  tls: true,
  credential: ' clave-api-de-prueba ',
  active: true,
  target: {
    tenantId: '0190a1b2-0000-7000-8000-000000000001',
    applicationId: '0190a1b2-0000-7000-8000-000000000002',
    ignorado: 'x',
  },
  deviceDefaults: { deviceProfileId: '0190a1b2-0000-7000-8000-000000000003' },
};

describe('profileBody', () => {
  it('al crear arma un cuerpo que el esquema compartido acepta', () => {
    const body = profileBody(chirp, false);
    expect(body).toMatchObject({
      kind: 'chirpstack',
      name: 'Principal',
      description: null,
      tls: true,
    });
    expect(body['target']).toEqual({
      tenantId: chirp.target['tenantId'],
      applicationId: chirp.target['applicationId'],
    });
    expect(createLnsProfileSchema.safeParse(body).success).toBe(true);
  });

  it('al editar no envía el proveedor ni una credencial vacía', () => {
    const body = profileBody({ ...chirp, credential: '' }, true);
    expect(body).not.toHaveProperty('kind');
    expect(body).not.toHaveProperty('credential');
    expect(profileBody(chirp, true)).toHaveProperty('credential', 'clave-api-de-prueba');
  });

  it('TTN no manda TLS y trae sus seis valores por defecto', () => {
    const ttn: ProfileForm = {
      ...chirp,
      kind: 'ttn',
      endpoint: 'https://eu1.example.test',
      target: { applicationId: 'app-prueba' },
      deviceDefaults: {
        frequencyPlanId: 'AU_915_928_FSB_2',
        macVersion: 'MAC_V1_0_3',
        phyVersion: 'PHY_V1_0_3_REV_A',
        joinServerAddress: 'js.example.test',
        networkServerAddress: 'ns.example.test',
        applicationServerAddress: 'as.example.test',
      },
    };
    const body = profileBody(ttn, false);
    expect(body).not.toHaveProperty('tls');
    expect(createLnsProfileSchema.safeParse(body).success).toBe(true);
  });
});
