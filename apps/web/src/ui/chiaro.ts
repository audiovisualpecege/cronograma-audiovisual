// Componentes do design system da Chiaro usados como estão. Os tipos do export só listam as props de
// exemplo; aqui eles aceitam também os atributos HTML que os componentes já repassam ao elemento
// (name, autoComplete, aria-*), sem mudar nada no componente.
import type { ButtonHTMLAttributes, InputHTMLAttributes, JSX, ReactNode } from 'react';
import { Badge as ChiaroBadge, type BadgeProps } from '@chiaro/components/core/Badge.jsx';
import { Button as ChiaroButton, type ButtonProps } from '@chiaro/components/core/Button.jsx';
import { Input as ChiaroInput, type InputProps } from '@chiaro/components/forms/Input.jsx';
import { Tabs as ChiaroTabs, type TabsProps } from '@chiaro/components/navigation/Tabs.jsx';
import { Card as ChiaroCard, type CardProps } from '@chiaro/components/surfaces/Card.jsx';

type Html<P, E> = Omit<E, keyof P> & P;

export const Button = ChiaroButton as unknown as (
  props: Html<Omit<ButtonProps, 'iconLeft' | 'iconRight'>, ButtonHTMLAttributes<HTMLButtonElement>>,
) => JSX.Element;

export const Input = ChiaroInput as unknown as (
  props: Html<InputProps, InputHTMLAttributes<HTMLInputElement>>,
) => JSX.Element;

export const Card = ChiaroCard as unknown as (props: CardProps & { children?: ReactNode }) => JSX.Element;
export const Badge = ChiaroBadge as unknown as (props: BadgeProps) => JSX.Element;
export const Tabs = ChiaroTabs as unknown as (props: TabsProps) => JSX.Element;
