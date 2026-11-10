import {
  loadThresholds,
  priorityStorageKey,
  resetThresholds,
  saveThresholds,
} from '../priorityStorage';
import { defaultThresholds } from '../responsePriority';

const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

const edited = (people: number) => {
  const t = defaultThresholds();
  t.red[0].conditions.find(c => c.metric === 'people')!.min = people;
  return t;
};
const peopleMin = (t: ReturnType<typeof defaultThresholds>) =>
  t.red[0].conditions.find(c => c.metric === 'people')!.min;

describe('per-country priority thresholds', () => {
  it('keeps a separate key per country', () => {
    expect(priorityStorageKey('vu')).toBe('pdie.priorityThresholds.v1.VU');
    expect(priorityStorageKey('TO')).not.toBe(priorityStorageKey('VU'));
  });

  it('what is set for one country does not apply to another', () => {
    const storage = fakeStorage();
    saveThresholds('VU', edited(5000), storage);
    expect(peopleMin(loadThresholds('VU', storage).thresholds)).toBe(5000);
    expect(loadThresholds('VU', storage).isCustom).toBe(true);
    const tonga = loadThresholds('TO', storage);
    expect(tonga.isCustom).toBe(false);
    expect(peopleMin(tonga.thresholds)).toBe(1000);
  });

  it('countries can hold different values side by side', () => {
    const storage = fakeStorage();
    saveThresholds('VU', edited(5000), storage);
    saveThresholds('WS', edited(200), storage);
    expect(peopleMin(loadThresholds('VU', storage).thresholds)).toBe(5000);
    expect(peopleMin(loadThresholds('WS', storage).thresholds)).toBe(200);
  });

  it('resetting one country leaves the others alone', () => {
    const storage = fakeStorage();
    saveThresholds('VU', edited(5000), storage);
    saveThresholds('WS', edited(200), storage);
    resetThresholds('VU', storage);
    expect(loadThresholds('VU', storage).isCustom).toBe(false);
    expect(peopleMin(loadThresholds('WS', storage).thresholds)).toBe(200);
  });

  it('survives unreadable or blocked storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadThresholds('VU', broken).isCustom).toBe(false);
    expect(saveThresholds('VU', defaultThresholds(), broken)).toBe(false);
    expect(() => resetThresholds('VU', broken)).not.toThrow();
    const storage = fakeStorage();
    storage.data.set(priorityStorageKey('VU'), '{not json');
    expect(loadThresholds('VU', storage).isCustom).toBe(false);
  });
});
