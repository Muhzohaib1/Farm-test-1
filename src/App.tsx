import { useEffect, type ReactNode } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './auth/session'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toast } from './components/ui'
import { DataProvider } from './data'
import { I18nProvider, useI18n } from './i18n'
import { AddMenu } from './pages/AddMenu'
import { AnimalForm } from './pages/AnimalForm'
import { AnimalProfile } from './pages/AnimalProfile'
import { Animals } from './pages/Animals'
import { Lock, Setup } from './pages/Auth'
import { BirthForm, Breeding, MatingForm } from './pages/Breeding'
import { Growth } from './pages/Growth'
import { DewormForm, FamachaRound, Health, TreatmentForm, VaccinationForm, VaccineTypes } from './pages/Health'
import { Home } from './pages/Home'
import { Money } from './pages/Money'
import { ExportPage, More, SettingsPage } from './pages/More'
import { Quarantine } from './pages/Quarantine'
import { DeathForm, ExpenseForm, SaleForm, ShearingForm, WeightForm } from './pages/Records'
import { startSync } from './sync/sync'

function BottomNav() {
  const { t } = useI18n()
  const items = [
    { to: '/', icon: '🏠', label: t('nav_home'), end: true },
    { to: '/animals', icon: '🐐', label: t('nav_animals') },
    { to: '/add', icon: '＋', label: t('nav_add'), big: true },
    { to: '/health', icon: '💉', label: t('nav_health') },
    { to: '/more', icon: '☰', label: t('nav_more') },
  ]
  return (
    <nav className="bottomnav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item${isActive ? ' on' : ''}${i.big ? ' big' : ''}`}>
          <span className="nav-icon">{i.icon}</span>
          <span className="nav-label">{i.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

function Shell() {
  const { profile, unlocked } = useSession()
  useEffect(() => {
    if (profile && unlocked) startSync()
  }, [profile, unlocked])
  if (!profile || !profile.pinHash) return <Setup />
  if (!unlocked) return <Lock />
  return (
    <DataProvider>
      <HashRouter>
        <ScrollTop />
        <RouteBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/animals" element={<Animals />} />
          <Route path="/animal/new" element={<AnimalForm />} />
          <Route path="/animal/:id" element={<AnimalProfile />} />
          <Route path="/animal/:id/edit" element={<AnimalForm />} />
          <Route path="/add" element={<AddMenu />} />
          <Route path="/breeding" element={<Breeding />} />
          <Route path="/breeding/mating" element={<MatingForm />} />
          <Route path="/breeding/birth" element={<BirthForm />} />
          <Route path="/health" element={<Health />} />
          <Route path="/health/deworm" element={<DewormForm />} />
          <Route path="/health/famacha" element={<FamachaRound />} />
          <Route path="/health/vaccinate" element={<VaccinationForm />} />
          <Route path="/health/vaccines" element={<VaccineTypes />} />
          <Route path="/health/treatment" element={<TreatmentForm />} />
          <Route path="/death" element={<DeathForm />} />
          <Route path="/quarantine" element={<Quarantine />} />
          <Route path="/weight" element={<WeightForm />} />
          <Route path="/growth" element={<Growth />} />
          <Route path="/shearing" element={<ShearingForm />} />
          <Route path="/sale" element={<SaleForm />} />
          <Route path="/expense" element={<ExpenseForm />} />
          <Route path="/money" element={<Money />} />
          <Route path="/more" element={<More />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </RouteBoundary>
        <BottomNav />
      </HashRouter>
    </DataProvider>
  )
}

export function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
      <Toast />
    </I18nProvider>
  )
}
