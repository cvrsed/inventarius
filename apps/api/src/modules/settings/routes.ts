import { appSettingsSchema } from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticatedRoute } from '../../core/access.js';
import type { AppConfig } from '../../core/config.js';

/** Ajustes de la instalación para la web (zona horaria, etc.). Cualquier usuario con sesión los lee. */
export const settingsRoutes: FastifyPluginAsyncZod<{ config: AppConfig }> = async (app, opts) => {
  app.get(
    '/settings',
    {
      ...authenticatedRoute({ allowPendingPasswordChange: true }),
      schema: { tags: ['settings'], response: { 200: appSettingsSchema } },
    },
    async () => ({
      timezone: opts.config.timezone,
      defaultCurrency: opts.config.defaultCurrency,
    }),
  );
};
