import { useState } from 'react';
import { View } from './types';
import CalendarView from './components/Calendar/CalendarView';
import SettingsView from './components/Settings/SettingsView';
import RaceDetailView from './components/RaceDetail/RaceDetailView';
import HorseDetailView from './components/HorseDetail/HorseDetailView';

export default function App() {
  const [view, setView] = useState<View>({ type: 'calendar' });

  function navigate(v: View) {
    setView(v);
  }

  if (view.type === 'settings') {
    return <SettingsView onBack={() => navigate({ type: 'calendar' })} />;
  }

  if (view.type === 'raceDetail') {
    return (
      <RaceDetailView
        race={view.race}
        onBack={() => navigate({ type: 'calendar' })}
        onNavigate={navigate}
      />
    );
  }

  if (view.type === 'horseDetail') {
    return (
      <HorseDetailView
        horseId={view.horseId}
        horseName={view.horseName}
        backView={view.backView}
        onBack={() => navigate(view.backView)}
        onNavigate={navigate}
      />
    );
  }

  return (
    <CalendarView
      onNavigateSettings={() => navigate({ type: 'settings' })}
      onNavigate={navigate}
    />
  );
}
