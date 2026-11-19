/**
 * Prepara un ChirpStack v4 de PRUEBA (compose de desarrollo y e2e): crea tenant, aplicación, device profile y una
 * API key de tenant, y escribe los ids en un JSON. No se usa en producción. Es idempotente salvo por la API key, que
 * se crea nueva en cada corrida.
 *
 * Uso: node dist/dev/chirpstack-bootstrap.js <host:puerto> <salida.json>
 * El usuario inicial `admin` de ChirpStack solo existe en una instalación de pruebas recién creada.
 */
import applicationGrpc from '@chirpstack/chirpstack-api/api/application_grpc_pb.js';
import applicationPb from '@chirpstack/chirpstack-api/api/application_pb.js';
import profileGrpc from '@chirpstack/chirpstack-api/api/device_profile_grpc_pb.js';
import profilePb from '@chirpstack/chirpstack-api/api/device_profile_pb.js';
import deviceGrpc from '@chirpstack/chirpstack-api/api/device_grpc_pb.js';
import devicePb from '@chirpstack/chirpstack-api/api/device_pb.js';
import internalGrpc from '@chirpstack/chirpstack-api/api/internal_grpc_pb.js';
import internalPb from '@chirpstack/chirpstack-api/api/internal_pb.js';
import tenantGrpc from '@chirpstack/chirpstack-api/api/tenant_grpc_pb.js';
import tenantPb from '@chirpstack/chirpstack-api/api/tenant_pb.js';
import commonPb from '@chirpstack/chirpstack-api/common/common_pb.js';
import { credentials, Metadata, type Client, type ServiceError } from '@grpc/grpc-js';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

type Make = (address: string, creds: ReturnType<typeof credentials.createInsecure>) => Client;

const [endpoint, outFile] = process.argv.slice(2);
if (!endpoint || !outFile) {
  process.stderr.write('Uso: chirpstack-bootstrap <host:puerto> <salida.json>\n');
  process.exit(2);
}
const TEST_ADMIN = { email: 'admin', password: 'admin' };

async function call<Res>(make: Make, method: string, request: unknown, jwt?: string): Promise<Res> {
  const client = make(endpoint!, credentials.createInsecure()) as unknown as Record<
    string,
    unknown
  > &
    Client;
  const meta = new Metadata();
  if (jwt) meta.set('authorization', `Bearer ${jwt}`);
  try {
    return await new Promise<Res>((resolve, reject) => {
      const fn = client[method] as (
        r: unknown,
        m: Metadata,
        cb: (e: ServiceError | null, res: Res) => void,
      ) => void;
      fn.call(client, request, meta, (err, res) => (err ? reject(err) : resolve(res)));
    });
  } finally {
    client.close();
  }
}

/** ChirpStack tarda unos segundos en aceptar conexiones: se reintenta hasta que responde. */
async function waitForLogin(): Promise<string> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const req = new internalPb.LoginRequest();
      req.setEmail(TEST_ADMIN.email);
      req.setPassword(TEST_ADMIN.password);
      const res = await call<InstanceType<typeof internalPb.LoginResponse>>(
        (a, c) => new internalGrpc.InternalServiceClient(a, c),
        'login',
        req,
      );
      return res.getJwt();
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const jwt = await waitForLogin();
const tenants = (a: string, c: ReturnType<typeof credentials.createInsecure>) =>
  new tenantGrpc.TenantServiceClient(a, c);

const NAME = 'Inventarius pruebas';

// Tenant
const listTenants = new tenantPb.ListTenantsRequest();
listTenants.setLimit(100);
listTenants.setSearch(NAME);
const found = await call<InstanceType<typeof tenantPb.ListTenantsResponse>>(
  tenants,
  'list',
  listTenants,
  jwt,
);
let tenantId =
  found
    .getResultList()
    .find((t) => t.getName() === NAME)
    ?.getId() ?? '';
if (!tenantId) {
  const tenant = new tenantPb.Tenant();
  tenant.setName(NAME);
  tenant.setCanHaveGateways(true);
  const req = new tenantPb.CreateTenantRequest();
  req.setTenant(tenant);
  tenantId = (
    await call<InstanceType<typeof tenantPb.CreateTenantResponse>>(tenants, 'create', req, jwt)
  ).getId();
}

// Aplicación
const apps = (a: string, c: ReturnType<typeof credentials.createInsecure>) =>
  new applicationGrpc.ApplicationServiceClient(a, c);
const listApps = new applicationPb.ListApplicationsRequest();
listApps.setLimit(100);
listApps.setTenantId(tenantId);
const foundApps = await call<InstanceType<typeof applicationPb.ListApplicationsResponse>>(
  apps,
  'list',
  listApps,
  jwt,
);
let applicationId =
  foundApps
    .getResultList()
    .find((a) => a.getName() === NAME)
    ?.getId() ?? '';
if (!applicationId) {
  const app = new applicationPb.Application();
  app.setName(NAME);
  app.setTenantId(tenantId);
  const req = new applicationPb.CreateApplicationRequest();
  req.setApplication(app);
  applicationId = (
    await call<InstanceType<typeof applicationPb.CreateApplicationResponse>>(
      apps,
      'create',
      req,
      jwt,
    )
  ).getId();
}

// Device profile OTAA, AU915 y LoRaWAN 1.0.3
const profiles = (a: string, c: ReturnType<typeof credentials.createInsecure>) =>
  new profileGrpc.DeviceProfileServiceClient(a, c);
const listProfiles = new profilePb.ListDeviceProfilesRequest();
listProfiles.setLimit(100);
listProfiles.setTenantId(tenantId);
const foundProfiles = await call<InstanceType<typeof profilePb.ListDeviceProfilesResponse>>(
  profiles,
  'list',
  listProfiles,
  jwt,
);

// Un device profile sin ADR algorithm es inválido para ChirpStack: se elige uno de los que ofrece el servidor
// (`default` si está) en vez de suponer un id.
const Empty = createRequire(import.meta.url)('google-protobuf/google/protobuf/empty_pb.js')
  .Empty as new () => object;
const adrAlgorithms = (
  await call<InstanceType<typeof profilePb.ListDeviceProfileAdrAlgorithmsResponse>>(
    profiles,
    'listAdrAlgorithms',
    new Empty(),
    jwt,
  )
)
  .getResultList()
  .map((a) => a.getId());
const adrAlgorithmId = adrAlgorithms.includes('default') ? 'default' : adrAlgorithms[0];
if (!adrAlgorithmId) throw new Error('ChirpStack no ofrece ningún ADR algorithm');

const existingProfile = foundProfiles.getResultList().find((p) => p.getName() === NAME);
let deviceProfileId = existingProfile?.getId() ?? '';
if (existingProfile) {
  // Un perfil creado por una versión anterior de este script quedó sin ADR algorithm: se completa.
  const getReq = new profilePb.GetDeviceProfileRequest();
  getReq.setId(deviceProfileId);
  const dp = (
    await call<InstanceType<typeof profilePb.GetDeviceProfileResponse>>(
      profiles,
      'get',
      getReq,
      jwt,
    )
  ).getDeviceProfile()!;
  if (!dp.getAdrAlgorithmId()) {
    dp.setAdrAlgorithmId(adrAlgorithmId);
    const updateReq = new profilePb.UpdateDeviceProfileRequest();
    updateReq.setDeviceProfile(dp);
    await call(profiles, 'update', updateReq, jwt);
  }
} else {
  const dp = new profilePb.DeviceProfile();
  dp.setName(NAME);
  dp.setTenantId(tenantId);
  dp.setRegion(commonPb.Region.AU915);
  dp.setMacVersion(commonPb.MacVersion.LORAWAN_1_0_3);
  dp.setRegParamsRevision(commonPb.RegParamsRevision.A);
  dp.setAdrAlgorithmId(adrAlgorithmId);
  dp.setSupportsOtaa(true);
  dp.setUplinkInterval(3600);
  const req = new profilePb.CreateDeviceProfileRequest();
  req.setDeviceProfile(dp);
  deviceProfileId = (
    await call<InstanceType<typeof profilePb.CreateDeviceProfileResponse>>(
      profiles,
      'create',
      req,
      jwt,
    )
  ).getId();
}

// Dispositivos «ajenos» (sin la etiqueta de Inventarius) para probar el flujo de vincular con un ChirpStack real. Son dos
// porque el e2e corre en escritorio y móvil a la vez y cada uno necesita el suyo. Los identificadores y la clave son
// inventados: el DevEUI sale de un prefijo y un contador; JoinEUI y clave, de bytes aleatorios en la primera corrida (en
// las siguientes se leen del dispositivo, así el JSON siempre dice lo que hay en ChirpStack).
const FOREIGN_PREFIX = '70b3d5ff';
const devices = (a: string, c: ReturnType<typeof credentials.createInsecure>) =>
  new deviceGrpc.DeviceServiceClient(a, c);
const foreignDevices: { devEui: string; joinEui: string; appKey: string }[] = [];
for (const n of [1, 2]) {
  const devEui = `${FOREIGN_PREFIX}${String(n).padStart(8, '0')}`;
  const getReq = new devicePb.GetDeviceRequest();
  getReq.setDevEui(devEui);
  const existing = await call<InstanceType<typeof devicePb.GetDeviceResponse>>(
    devices,
    'get',
    getReq,
    jwt,
  ).catch(() => null);
  let joinEui: string;
  let appKey: string;
  if (existing) {
    joinEui = existing.getDevice()!.getJoinEui();
    const keysReq = new devicePb.GetDeviceKeysRequest();
    keysReq.setDevEui(devEui);
    appKey = (
      await call<InstanceType<typeof devicePb.GetDeviceKeysResponse>>(
        devices,
        'getKeys',
        keysReq,
        jwt,
      )
    )
      .getDeviceKeys()!
      .getNwkKey();
  } else {
    joinEui = randomBytes(8).toString('hex');
    appKey = randomBytes(16).toString('hex');
    const device = new devicePb.Device();
    device.setDevEui(devEui);
    device.setJoinEui(joinEui);
    device.setName(`Dispositivo ajeno de prueba ${n}`);
    device.setApplicationId(applicationId);
    device.setDeviceProfileId(deviceProfileId);
    const createReq = new devicePb.CreateDeviceRequest();
    createReq.setDevice(device);
    await call(devices, 'create', createReq, jwt);
    // LoRaWAN 1.0.x: la AppKey va en `nwk_key`.
    const keys = new devicePb.DeviceKeys();
    keys.setDevEui(devEui);
    keys.setNwkKey(appKey);
    const keysReq = new devicePb.CreateDeviceKeysRequest();
    keysReq.setDeviceKeys(keys);
    await call(devices, 'createKeys', keysReq, jwt);
  }
  foreignDevices.push({
    devEui: devEui.toUpperCase(),
    joinEui: joinEui.toUpperCase(),
    appKey: appKey.toUpperCase(),
  });
}

// API key del tenant (con los derechos mínimos que usa Inventarius)
const key = new internalPb.ApiKey();
key.setName(`inventarius-${Date.now()}`);
key.setIsAdmin(false);
key.setTenantId(tenantId);
const keyReq = new internalPb.CreateApiKeyRequest();
keyReq.setApiKey(key);
const created = await call<InstanceType<typeof internalPb.CreateApiKeyResponse>>(
  (a, c) => new internalGrpc.InternalServiceClient(a, c),
  'createApiKey',
  keyReq,
  jwt,
);

writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      endpoint,
      tenantId,
      applicationId,
      deviceProfileId,
      apiKey: created.getToken(),
      foreignDevices,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`ChirpStack de prueba listo: tenant ${tenantId}\n`);
