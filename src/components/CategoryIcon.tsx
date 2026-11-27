import React from 'react';
import {
  ArrowLeftRight,
  Briefcase,
  Car,
  CreditCard,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PawPrint,
  Plane,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Utensils,
  Wifi,
  Zap,
} from 'lucide-react';

interface CategoryIconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Home,
  Landmark,
  Shield,
  ShoppingCart,
  Utensils,
  Zap,
  Car,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Sparkles,
  CreditCard,
  Wifi,
  Dumbbell,
  PawPrint,
  GraduationCap,
  Gift,
  ArrowLeftRight,
  Tag,
};

export const AVAILABLE_CATEGORY_ICONS: { name: string; label: string }[] = [
  { name: 'Home', label: 'Casa' },
  { name: 'Landmark', label: 'Banco' },
  { name: 'Shield', label: 'Seguro' },
  { name: 'ShoppingCart', label: 'Supermercado' },
  { name: 'Utensils', label: 'Restaurante' },
  { name: 'Zap', label: 'Suministros' },
  { name: 'Car', label: 'Transporte' },
  { name: 'Plane', label: 'Viajes' },
  { name: 'HeartPulse', label: 'Salud' },
  { name: 'ShoppingBag', label: 'Compras' },
  { name: 'Briefcase', label: 'Trabajo' },
  { name: 'Sparkles', label: 'Extra' },
  { name: 'CreditCard', label: 'Tarjeta' },
  { name: 'Wifi', label: 'Internet' },
  { name: 'Dumbbell', label: 'Deporte' },
  { name: 'PawPrint', label: 'Mascotas' },
  { name: 'GraduationCap', label: 'Estudios' },
  { name: 'Gift', label: 'Regalos' },
  { name: 'Tag', label: 'Etiqueta' },
];

export const AVAILABLE_CATEGORY_COLORS: string[] = [
  '#10B981',
  '#0EA5E9',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#F97316',
  '#14B8A6',
  '#22C55E',
  '#EF4444',
  '#64748B',
];

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, className = 'w-4 h-4', style }) => {
  const Icon = ICON_MAP[name] ?? Tag;
  return <Icon className={className} style={style} aria-hidden="true" />;
};
