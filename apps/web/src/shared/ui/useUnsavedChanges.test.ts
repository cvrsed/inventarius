import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { globalPlugins } from '@/test-utils';
import { useConfirm } from './useConfirm';
import { useUnsavedChanges } from './useUnsavedChanges';

afterEach(() => {
  useConfirm().close();
  vi.restoreAllMocks();
});

function harness() {
  const text = ref('');
  const open = ref(true);
  let api!: ReturnType<typeof useUnsavedChanges>;
  const Comp = defineComponent({
    setup() {
      api = useUnsavedChanges(() => text.value, open);
      return () => h('div');
    },
  });
  const w = mount(Comp, { global: globalPlugins() });
  return { w, text, open, api: () => api };
}

const settle = async () => {
  await new Promise((r) => setTimeout(r, 5));
  await flushPromises();
};

describe('useUnsavedChanges (P15)', () => {
  it('no hay cambios hasta que el formulario se modifica; markClean lo deja limpio', async () => {
    const { w, text, api } = harness();
    await settle();
    expect(api().dirty.value).toBe(false);
    text.value = 'algo';
    expect(api().dirty.value).toBe(true);
    api().markClean();
    expect(api().dirty.value).toBe(false);
    w.unmount();
  });

  it('beforeunload solo se cancela con cambios sin guardar', async () => {
    const { w, text } = harness();
    await settle();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    text.value = 'cambio';
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    w.unmount();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('cerrar con cambios pide confirmar: seguir editando conserva, descartar cierra', async () => {
    const { w, text, api } = harness();
    await settle();
    text.value = 'cambio';
    const close = vi.fn();
    const pending = api().requestClose(close);
    await flushPromises();
    expect(useConfirm().state.open).toBe(true);
    expect(useConfirm().state.options?.title).toBe('Cambios sin guardar');
    useConfirm().close(); // «Seguir editando»
    await pending;
    expect(close).not.toHaveBeenCalled();

    const second = api().requestClose(close);
    await flushPromises();
    await useConfirm().state.options!.accept(); // «Descartar cambios»
    await second;
    expect(close).toHaveBeenCalledOnce();
    w.unmount();
  });

  it('sin cambios cierra sin preguntar', async () => {
    const { w, api } = harness();
    await settle();
    const close = vi.fn();
    await api().requestClose(close);
    expect(close).toHaveBeenCalledOnce();
    expect(useConfirm().state.open).toBe(false);
    w.unmount();
  });

  it('un diálogo cerrado no avisa aunque el formulario cambie', async () => {
    const { w, text, open, api } = harness();
    await settle();
    open.value = false;
    text.value = 'cambio';
    expect(api().dirty.value).toBe(false);
    w.unmount();
  });
});
