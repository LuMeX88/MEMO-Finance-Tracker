import { useState, useMemo } from 'react'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

// ── Icon data: [emoji, german keywords, english keywords] ─────────────────────
const ICONS: [string, string, string][] = [
  // Money & Finance
  ['💰', 'geld finanzen', 'money finance'],
  ['💳', 'karte zahlung', 'card payment'],
  ['💵', 'dollar schein', 'dollar bill cash'],
  ['💶', 'euro schein', 'euro bill'],
  ['🏦', 'bank sparkasse', 'bank'],
  ['💸', 'ausgabe geld fliegt', 'spending money flies'],
  ['🪙', 'münze coin', 'coin'],
  ['📈', 'chart wachstum', 'chart growth'],
  ['📉', 'chart verlust sinken', 'chart decline loss'],
  ['🧾', 'quittung rechnung', 'receipt bill invoice'],
  ['💼', 'koffer business arbeit', 'briefcase business work'],
  // Food & Drinks
  ['🍔', 'burger fast food', 'burger fast food'],
  ['🍕', 'pizza essen', 'pizza food'],
  ['🥗', 'salat gesund', 'salad healthy'],
  ['🍜', 'nudeln suppe', 'noodles soup'],
  ['🍣', 'sushi japanisch', 'sushi japanese'],
  ['🥩', 'fleisch steak', 'meat steak'],
  ['🥐', 'croissant bäckerei frühstück', 'croissant bakery breakfast'],
  ['☕', 'kaffee tee', 'coffee tea'],
  ['🧃', 'saft getränk', 'juice drink'],
  ['🍷', 'wein restaurant', 'wine restaurant'],
  ['🍺', 'bier getränke', 'beer drinks'],
  ['🧁', 'kuchen dessert backen', 'cake dessert baking'],
  ['🍦', 'eis süss', 'ice cream sweet'],
  ['🥤', 'getränk trinken', 'drink beverage'],
  ['🛒', 'einkaufen supermarkt', 'shopping grocery'],
  // Transport
  ['🚌', 'bus öffentlich transport', 'bus public transport'],
  ['🚇', 'ubahn metro', 'subway metro'],
  ['🚗', 'auto fahren', 'car drive'],
  ['✈️', 'flug reisen flugzeug', 'flight travel airplane'],
  ['🚂', 'zug bahn', 'train rail'],
  ['🚲', 'fahrrad velo', 'bicycle bike'],
  ['🛵', 'moped roller', 'scooter moped'],
  ['🚕', 'taxi', 'taxi cab'],
  ['⛽', 'benzin tanken', 'fuel gas petrol'],
  ['🅿️', 'parkplatz parken', 'parking'],
  // Housing
  ['🏠', 'haus wohnen', 'house home'],
  ['🏢', 'büro gebäude', 'office building'],
  ['🛋️', 'möbel sofa wohnzimmer', 'furniture sofa living room'],
  ['🔑', 'schlüssel miete', 'key rent'],
  ['🧹', 'reinigung putzen', 'cleaning'],
  ['🪴', 'pflanze garten', 'plant garden'],
  ['🛁', 'bad dusche', 'bath shower'],
  ['💡', 'strom licht energie', 'electricity light energy'],
  ['🌡️', 'heizung temperatur', 'heating temperature'],
  ['📦', 'box paket lieferung', 'box package delivery'],
  // Health
  ['💊', 'medizin apotheke', 'medicine pharmacy'],
  ['🏥', 'krankenhaus spital', 'hospital clinic'],
  ['🩺', 'arzt doktor', 'doctor physician'],
  ['🧘', 'yoga sport fitness', 'yoga sport fitness'],
  ['🏃', 'laufen sport', 'running sport'],
  ['🦷', 'zahnarzt zahn', 'dentist tooth'],
  ['👓', 'brille sehen', 'glasses vision'],
  ['🩹', 'pflaster erste hilfe', 'bandage first aid'],
  ['🧴', 'pflegeprodukt körperpflege', 'skincare body care'],
  // Entertainment
  ['🎬', 'film kino streaming', 'movie cinema streaming'],
  ['🎮', 'spiel gaming', 'game gaming'],
  ['🎵', 'musik konzert', 'music concert'],
  ['📚', 'bücher lesen bildung', 'books reading education'],
  ['🎭', 'theater kunst', 'theater arts'],
  ['🎨', 'kunst malen', 'art painting'],
  ['🏟️', 'sport stadion', 'sports stadium'],
  ['🎳', 'bowling freizeit', 'bowling leisure'],
  ['🎲', 'brettspiel würfel', 'board game dice'],
  ['📺', 'tv fernsehen', 'tv television'],
  ['🎤', 'mikrofon karaoke', 'microphone karaoke'],
  ['🎸', 'gitarre instrument', 'guitar instrument'],
  // Shopping
  ['🛍️', 'einkaufen shopping', 'shopping bags'],
  ['👗', 'kleidung mode', 'clothing fashion'],
  ['👟', 'schuhe sneaker', 'shoes sneakers'],
  ['💄', 'kosmetik beauty', 'cosmetics beauty'],
  ['⌚', 'uhr accessoire', 'watch accessory'],
  ['💻', 'laptop computer', 'laptop computer'],
  ['📱', 'handy smartphone', 'phone smartphone'],
  ['🎁', 'geschenk', 'gift present'],
  ['🧸', 'spielzeug kinder', 'toy kids'],
  ['🪑', 'möbel stuhl', 'furniture chair'],
  // Travel
  ['🌍', 'welt reise', 'world travel'],
  ['🏖️', 'strand urlaub', 'beach vacation'],
  ['🏔️', 'berg wandern', 'mountain hiking'],
  ['🗺️', 'karte reisen', 'map travel'],
  ['🛏️', 'hotel übernachtung', 'hotel accommodation'],
  ['🎡', 'freizeitpark urlaub', 'amusement park vacation'],
  ['🧳', 'koffer reise', 'suitcase travel luggage'],
  ['🗼', 'paris turm sehenswürdigkeit', 'paris tower landmark'],
  // Education & Work
  ['🎓', 'bildung schule uni', 'education school university'],
  ['📝', 'notiz schreiben', 'note writing'],
  ['🖊️', 'stift arbeiten', 'pen work'],
  ['📋', 'liste aufgaben', 'list tasks'],
  ['📐', 'büro material', 'office supplies'],
  ['🔬', 'wissenschaft forschung', 'science research'],
  ['💻', 'computer software', 'computer software'],
  ['🖨️', 'drucker büro', 'printer office'],
  // Family & Social
  ['👨‍👩‍👧‍👦', 'familie', 'family'],
  ['👶', 'kind baby', 'baby child'],
  ['🐕', 'hund tier', 'dog pet'],
  ['🐈', 'katze tier', 'cat pet'],
  ['🎂', 'geburtstag feier', 'birthday celebration'],
  ['💒', 'hochzeit heirat', 'wedding marriage'],
  ['🎉', 'party feier', 'party celebration'],
  ['💝', 'liebe geschenk', 'love gift'],
  // Utilities & Services
  ['📡', 'internet abo', 'internet subscription'],
  ['📞', 'telefon abo kommunikation', 'phone subscription communication'],
  ['📧', 'email dienste', 'email services'],
  ['🔒', 'sicherheit versicherung', 'security insurance'],
  ['⚙️', 'einstellungen service', 'settings service'],
  ['🔧', 'reparatur handwerker', 'repair maintenance'],
  ['🧰', 'werkzeug reparatur', 'tools repair'],
  ['♻️', 'recycling umwelt', 'recycling environment'],
  ['💧', 'wasser strom', 'water utility'],
  ['🌿', 'ökostrom natur', 'eco energy nature'],
  // Other / Misc
  ['⭐', 'stern besonders', 'star special'],
  ['❤️', 'herz liebe', 'heart love'],
  ['🏷️', 'tag etikette', 'tag label'],
  ['📌', 'pin merken', 'pin bookmark'],
  ['🔖', 'lesezeichen', 'bookmark'],
  ['💬', 'kommunikation', 'communication'],
  ['📊', 'statistik', 'statistics chart'],
  ['🗓️', 'kalender termin', 'calendar appointment'],
  ['⏰', 'zeit uhr', 'time clock'],
  ['🌟', 'gold top premium', 'gold top premium'],
]

const GROUPS = [
  { label: '💰', title: 'Finanzen / Finance', emojis: ICONS.slice(0, 11) },
  { label: '🍔', title: 'Essen & Trinken / Food', emojis: ICONS.slice(11, 26) },
  { label: '🚗', title: 'Transport', emojis: ICONS.slice(26, 36) },
  { label: '🏠', title: 'Wohnen / Housing', emojis: ICONS.slice(36, 47) },
  { label: '💊', title: 'Gesundheit / Health', emojis: ICONS.slice(47, 56) },
  { label: '🎬', title: 'Freizeit / Entertainment', emojis: ICONS.slice(56, 67) },
  { label: '🛍️', title: 'Shopping', emojis: ICONS.slice(67, 77) },
  { label: '✈️', title: 'Reisen / Travel', emojis: ICONS.slice(77, 85) },
  { label: '🎓', title: 'Arbeit / Work', emojis: ICONS.slice(85, 93) },
  { label: '👨‍👩‍👧‍👦', title: 'Familie / Family', emojis: ICONS.slice(93, 101) },
  { label: '📡', title: 'Dienste / Services', emojis: ICONS.slice(101, 111) },
  { label: '⭐', title: 'Sonstiges / Other', emojis: ICONS.slice(111) },
]

interface IconPickerProps {
  value: string
  onChange: (emoji: string) => void
  label?: string
}

export default function IconPicker({ value, onChange, label }: IconPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState(0)

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return ICONS.filter(
      ([emoji, de, en]) =>
        emoji === q || de.includes(q) || en.includes(q),
    )
  }, [search])

  const displayIcons = filteredIcons ?? GROUPS[activeGroup]?.emojis ?? []

  function select(emoji: string) {
    onChange(emoji)
    setOpen(false)
    setSearch('')
  }

  return (
    <div>
      {label && (
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</p>
      )}
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={t('categories.chooseIcon')}
        aria-expanded={open}
      >
        <span className="text-2xl leading-none">{value || '📦'}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-1 text-left">
          {t('categories.chooseIcon')}
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {/* Inline expanding panel – no absolute positioning, no overflow issues */}
      {open && (
        <div className="mt-2 w-full bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('categories.searchIcon')}
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Group tabs – only when not searching */}
          {!search && (
            <div className="flex overflow-x-auto gap-1 p-2 border-b border-gray-200 dark:border-gray-600 no-scrollbar">
              {GROUPS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  title={g.title}
                  onClick={() => setActiveGroup(i)}
                  className={cn(
                    'shrink-0 w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors',
                    activeGroup === i
                      ? 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-400'
                      : 'hover:bg-white dark:hover:bg-gray-600',
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          {/* Icon grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto no-scrollbar">
            {displayIcons.length === 0 ? (
              <p className="col-span-8 text-center text-sm text-gray-400 py-6">
                {t('common.noData')}
              </p>
            ) : (
              displayIcons.map(([emoji]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => select(emoji)}
                  className={cn(
                    'text-xl w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white dark:hover:bg-gray-600',
                    value === emoji && 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-400',
                  )}
                >
                  {emoji}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

