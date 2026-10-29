import { useStore } from 'zustand';
import { weatherStore, type WeatherState } from '../../../engine/world/weather';

/** The weather store, read from a React component (weather.ts itself stays free of React, for the world engine). */
export const useWeather = <T>(pick: (s: WeatherState) => T): T => useStore(weatherStore, pick);
