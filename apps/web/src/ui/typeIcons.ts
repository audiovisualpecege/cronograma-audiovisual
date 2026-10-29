// Banco de ícones dos tipos de serviço (Solar, bold-duotone). O cadastro guarda só a chave (service_types.icon);
// tipo sem ícone escolhido ganha um pelo nome, e o calendário quando nenhuma regra serve.
import { normalizeName } from '@cronograma/core';
import {
  BookIcon,
  BookmarkIcon,
  BuildingsIcon,
  CalendarIcon,
  CameraIcon,
  ChatRoundLineIcon,
  ClipboardListIcon,
  ClockCircleIcon,
  CloudUploadIcon,
  ConfettiIcon,
  CupHotIcon,
  CupStarIcon,
  DocumentTextIcon,
  FlagIcon,
  ForbiddenCircleIcon,
  GalleryEditIcon,
  GiftIcon,
  GlobalIcon,
  HandShakeIcon,
  HeadphonesRoundSoundIcon,
  LaptopIcon,
  LightbulbIcon,
  MapPointWaveIcon,
  MedicalKitIcon,
  MicrophoneLargeIcon,
  MonitorIcon,
  MusicNoteIcon,
  PaletteIcon,
  PodcastIcon,
  PresentationGraphIcon,
  RadioIcon,
  SquareAcademicCapIcon,
  StarsIcon,
  SuitcaseIcon,
  SunIcon,
  UsersGroupRoundedIcon,
  VideoFrameCutIcon,
  VideocameraIcon,
  VideocameraRecordIcon,
} from '@solar-icons/react/bold-duotone';
import type { Icon } from '@solar-icons/react/lib/types';

export interface TypeIcon {
  key: string;
  label: string;
  icon: Icon;
}

/** Ícones que o cadastro oferece, na ordem em que aparecem para escolher. */
export const TYPE_ICONS: readonly TypeIcon[] = [
  { key: 'aula', label: 'Aula', icon: SquareAcademicCapIcon },
  { key: 'curso', label: 'Curso', icon: BookIcon },
  { key: 'computador', label: 'Computador', icon: LaptopIcon },
  { key: 'monitor', label: 'Tela', icon: MonitorIcon },
  { key: 'enviar', label: 'Enviar vídeo', icon: CloudUploadIcon },
  { key: 'transmissao', label: 'Transmissão', icon: RadioIcon },
  { key: 'palestra', label: 'Palestra', icon: PresentationGraphIcon },
  { key: 'microfone', label: 'Microfone', icon: MicrophoneLargeIcon },
  { key: 'podcast', label: 'Podcast', icon: PodcastIcon },
  { key: 'gravacao', label: 'Gravação', icon: VideocameraRecordIcon },
  { key: 'camera', label: 'Câmera', icon: VideocameraIcon },
  { key: 'foto', label: 'Foto', icon: CameraIcon },
  { key: 'edicao-foto', label: 'Edição de foto', icon: GalleryEditIcon },
  { key: 'edicao', label: 'Edição de vídeo', icon: VideoFrameCutIcon },
  { key: 'arte', label: 'Arte', icon: PaletteIcon },
  { key: 'musica', label: 'Música', icon: MusicNoteIcon },
  { key: 'audio', label: 'Áudio', icon: HeadphonesRoundSoundIcon },
  { key: 'evento', label: 'Evento', icon: ConfettiIcon },
  { key: 'externa', label: 'Externa', icon: MapPointWaveIcon },
  { key: 'empresa', label: 'Empresa', icon: BuildingsIcon },
  { key: 'online', label: 'On-line', icon: GlobalIcon },
  { key: 'reuniao', label: 'Reunião', icon: UsersGroupRoundedIcon },
  { key: 'conversa', label: 'Conversa', icon: ChatRoundLineIcon },
  { key: 'parceria', label: 'Parceria', icon: HandShakeIcon },
  { key: 'documento', label: 'Documento', icon: DocumentTextIcon },
  { key: 'tarefa', label: 'Tarefa', icon: ClipboardListIcon },
  { key: 'ideia', label: 'Ideia', icon: LightbulbIcon },
  { key: 'destaque', label: 'Destaque', icon: StarsIcon },
  { key: 'premio', label: 'Prêmio', icon: CupStarIcon },
  { key: 'marco', label: 'Marco', icon: FlagIcon },
  { key: 'presente', label: 'Comemoração', icon: GiftIcon },
  { key: 'ferias', label: 'Férias', icon: SuitcaseIcon },
  { key: 'folga', label: 'Folga', icon: SunIcon },
  { key: 'pausa', label: 'Pausa', icon: CupHotIcon },
  { key: 'saude', label: 'Saúde', icon: MedicalKitIcon },
  { key: 'reserva', label: 'Reserva', icon: BookmarkIcon },
  { key: 'bloqueio', label: 'Não escalar', icon: ForbiddenCircleIcon },
  { key: 'horario', label: 'Horário', icon: ClockCircleIcon },
  { key: 'calendario', label: 'Calendário', icon: CalendarIcon },
];

const BY_KEY = new Map(TYPE_ICONS.map((t) => [t.key, t]));
const FALLBACK = BY_KEY.get('calendario') as TypeIcon;

// Ícone pelo nome, para os tipos sem ícone escolhido. A ordem importa: a regra mais específica primeiro.
const RULES: [RegExp, string][] = [
  [/ferias/, 'ferias'],
  [/folga/, 'folga'],
  [/nao escalar|nao marcar|reserva|bloque/, 'reserva'],
  [/edicao.*foto|tratamento/, 'edicao-foto'],
  [/foto/, 'foto'],
  [/podcast|videocast/, 'podcast'],
  [/externa/, 'externa'],
  [/solution/, 'empresa'],
  [/grava/, 'gravacao'],
  [/disponibiliz/, 'enviar'],
  [/transmi/, 'transmissao'],
  [/webinar|palestra/, 'palestra'],
  [/reuniao/, 'reuniao'],
  [/evento/, 'evento'],
  [/curso/, 'curso'],
  [/aula|mba/, 'aula'],
  [/edicao/, 'edicao'],
];

/** Ícone do tipo: o escolhido no cadastro ou, sem escolha, um pelo nome. */
export function typeIcon(type: { name: string; icon?: string | null } | undefined | null): TypeIcon {
  if (!type) return FALLBACK;
  const chosen = type.icon ? BY_KEY.get(type.icon) : undefined;
  if (chosen) return chosen;
  const n = normalizeName(type.name);
  const key = RULES.find(([re]) => re.test(n))?.[1];
  return (key && BY_KEY.get(key)) || FALLBACK;
}
