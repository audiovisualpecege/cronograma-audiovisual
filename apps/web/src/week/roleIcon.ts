// Ícone de cada função pelo nome do cadastro (os nomes mudam pouco; função nova sem regra fica com a pessoa).
import { normalizeName } from '@cronograma/core';
import {
  CameraIcon,
  ClipboardListIcon,
  CloudUploadIcon,
  CrownStarIcon,
  GalleryEditIcon,
  HeadphonesRoundSoundIcon,
  Microphone3Icon,
  MonitorIcon,
  SpeakerIcon,
  StarsIcon,
  UserHandsIcon,
  UserIcon,
  VideoFrameCutIcon,
  VideocameraIcon,
  VideocameraRecordIcon,
} from '@solar-icons/react/bold-duotone';
import type { Icon } from '@solar-icons/react/lib/types';

// A ordem importa: "Edição Foto" antes de "Foto" e de "Edição".
const RULES: [RegExp, Icon][] = [
  [/edicao foto/, GalleryEditIcon],
  [/foto/, CameraIcon],
  [/anima/, StarsIcon],
  [/edicao/, VideoFrameCutIcon],
  [/media/, Microphone3Icon],
  [/assist/, UserHandsIcon],
  [/auditorio/, SpeakerIcon],
  [/aula/, MonitorIcon],
  [/evento/, VideocameraRecordIcon],
  [/cinegraf|camera/, VideocameraIcon],
  [/produ/, ClipboardListIcon],
  [/suporte/, HeadphonesRoundSoundIcon],
  [/lider/, CrownStarIcon],
  [/disponibiliz/, CloudUploadIcon],
];

export function roleIcon(name: string): Icon {
  const n = normalizeName(name);
  return RULES.find(([re]) => re.test(n))?.[1] ?? UserIcon;
}
