/**
 * Industry templates for Visits. Picking one sets a workspace up in one go:
 *
 *  - **services**: what a visit can be (Dine-in, Haircut, Car service…) and,
 *    for the ones customers come back for, how many days until they usually do;
 *  - **fields**: extra things worth knowing about a guest in that business
 *    (favourite dish, stylist, vehicle, pet's name…), added as contact fields;
 *  - **rules**: ready-made follow-up series with their wording: thank-you and
 *    review request, "we miss you", birthday/anniversary wishes, a reward on
 *    the Nth visit, and a reminder when each service is due again.
 *
 * Everything created is ordinary data the owner can edit or switch off later.
 * Message text uses the same `[[field]]` tokens as the rest of the app.
 */
import type { DelayUnit } from '@/services/crm/sequences';
import type { UserFieldType } from '@/services/crm/schema';

export type IndustryField = {
  name: string;
  type: UserFieldType;
  options?: string[];
  /** The English name, after localizing: message tokens (`[[lead_x_pet_name]]`) are keyed by it. */
  en?: string;
};

/** When a rule starts. `service` names a service of the template by key; `occasion` a date on the guest. */
export type RuleTrigger =
  | { kind: 'visit' }
  | { kind: 'milestone'; visits: number }
  | { kind: 'occasion'; field: 'birthday' | 'anniversary' | { userField: string }; daysBefore: number };

export type RuleStep = { wait: { value: number; unit: DelayUnit }; text: string };

export type IndustryRule = {
  key: string;
  name: string;
  /** One line on what it does, shown in setup. */
  description: string;
  trigger: RuleTrigger;
  steps: RuleStep[];
  /** On by default in setup (the owner can untick). */
  recommended: boolean;
};

export type IndustryService = { key: string; name: string; /** Usually back after this many days (a reminder is made for it). */ days: number | null };

export type Industry = {
  key: string;
  name: string;
  /** lucide icon name, mapped in the UI. */
  icon: 'utensils' | 'scissors' | 'stethoscope' | 'dumbbell' | 'car' | 'wrench' | 'shopping' | 'paw' | 'graduation' | 'store';
  /** One line for the picker. */
  blurb: string;
  /** What the business calls the people who visit. */
  guest: string;
  guests: string;
  services: IndustryService[];
  fields: IndustryField[];
  rules: IndustryRule[];
  /** Wording of the "due again" reminder made for each service with `days`. `[[service]]` is the service name. */
  recall: string | null;
  /** Ask party size at check-in. */
  partySize: boolean;
  /** Ask for a birthday at check-in (new guests). */
  askBirthday: boolean;
  /** After localizing: name and one-line description of a service's "due again" reminder. */
  recallName?: (service: string) => string;
  recallDescription?: (service: string, days: number) => string;
};

const h = (value: number): RuleStep['wait'] => ({ value, unit: 'hours' });
const d = (value: number): RuleStep['wait'] => ({ value, unit: 'days' });
const now: RuleStep['wait'] = { value: 0, unit: 'minutes' };

/* ---------------------------- shared rule wording --------------------------- */

const thanks = (wait: RuleStep['wait'], body: string): IndustryRule => ({
  key: 'thanks',
  name: 'Thank you + review',
  description: 'After each visit: a thank-you with your review link.',
  trigger: { kind: 'visit' },
  steps: [{ wait, text: body }],
  recommended: true,
});

const winBack = (days: number, body: string): IndustryRule => ({
  key: 'winback',
  name: 'We miss you',
  description: `If they haven't been back in ${days} days. Starts over at every visit, so regulars never get it.`,
  trigger: { kind: 'visit' },
  steps: [{ wait: d(days), text: body }],
  recommended: true,
});

const birthday = (daysBefore: number, body: string): IndustryRule => ({
  key: 'birthday',
  name: 'Birthday wishes',
  description: daysBefore ? `${daysBefore} days before their birthday, every year.` : 'On their birthday, every year.',
  trigger: { kind: 'occasion', field: 'birthday', daysBefore },
  steps: [{ wait: now, text: body }],
  recommended: true,
});

const anniversary = (daysBefore: number, body: string): IndustryRule => ({
  key: 'anniversary',
  name: 'Anniversary wishes',
  description: `${daysBefore} days before their anniversary, every year.`,
  trigger: { kind: 'occasion', field: 'anniversary', daysBefore },
  steps: [{ wait: now, text: body }],
  recommended: true,
});

const milestone = (visits: number, body: string): IndustryRule => ({
  key: `milestone_${visits}`,
  name: `${visits}th visit reward`,
  description: `Once, on their ${visits}th visit.`,
  trigger: { kind: 'milestone', visits },
  steps: [{ wait: h(1), text: body }],
  recommended: true,
});

/* -------------------------------- industries -------------------------------- */

export const INDUSTRIES: Industry[] = [
  {
    key: 'restaurant',
    name: 'Restaurant & café',
    icon: 'utensils',
    blurb: 'Bring diners back: thank-you + review, birthdays, regulars rewards.',
    guest: 'Guest',
    guests: 'Guests',
    services: [
      { key: 'dine_in', name: 'Dine-in', days: null },
      { key: 'takeaway', name: 'Takeaway', days: null },
      { key: 'delivery', name: 'Delivery', days: null },
      { key: 'party', name: 'Party / event', days: null },
    ],
    fields: [
      { name: 'Favourite dish', type: 'text' },
      { name: 'Food preference', type: 'dropdown', options: ['Veg', 'Non-veg', 'Vegan', 'Jain', 'Eggetarian'] },
      { name: 'Seating preference', type: 'dropdown', options: ['Indoor', 'Outdoor', 'Window', 'Private'] },
      { name: 'Allergies', type: 'text' },
    ],
    rules: [
      thanks(
        h(2),
        'Thank you for dining with us at [[business]], [[first_name]]! 🍽️ We hope you loved it. If you have a minute, a quick review means a lot to us: [[review_link]]',
      ),
      winBack(21, "Hi [[first_name]], it's been a while! 😊 We've got some new dishes we think you'll love. Come by [[business]] this week, we'd love to see you again."),
      birthday(5, 'Happy early birthday, [[first_name]]! 🎂 Celebrate with us at [[business]]: your dessert is on the house on your birthday week. Just show this message.'),
      anniversary(5, 'Happy anniversary in advance, [[first_name]]! 💐 Make it special at [[business]]. Reply here and we will keep the best table ready for you.'),
      milestone(5, "[[first_name]], that's your 5th visit to [[business]]! 🎉 Thank you for being a regular. Your next visit comes with a complimentary dessert."),
    ],
    recall: null,
    partySize: true,
    askBirthday: true,
  },
  {
    key: 'salon',
    name: 'Salon & spa',
    icon: 'scissors',
    blurb: 'Reminders when the next haircut or facial is due, plus birthdays.',
    guest: 'Client',
    guests: 'Clients',
    services: [
      { key: 'haircut', name: 'Haircut', days: 30 },
      { key: 'shaving', name: 'Shaving / beard', days: 14 },
      { key: 'hair_colour', name: 'Hair colour', days: 45 },
      { key: 'facial', name: 'Facial', days: 30 },
      { key: 'mani_pedi', name: 'Manicure / pedicure', days: 21 },
      { key: 'spa', name: 'Spa / massage', days: 30 },
    ],
    fields: [
      { name: 'Preferred stylist', type: 'text' },
      { name: 'Hair type', type: 'dropdown', options: ['Straight', 'Wavy', 'Curly', 'Coily'] },
      { name: 'Skin type', type: 'dropdown', options: ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'] },
      { name: 'Allergies', type: 'text' },
    ],
    rules: [
      thanks(h(3), 'Thank you for visiting [[business]], [[first_name]]! ✨ Loved your new look? A quick review helps us a lot: [[review_link]]'),
      winBack(60, 'Hi [[first_name]], we miss you at [[business]]! 💇 Book your next appointment this week and get 10% off. Just reply here.'),
      birthday(0, 'Happy birthday, [[first_name]]! 🎉 A birthday treat from [[business]]: 20% off any service this month. Reply to book.'),
      milestone(5, 'Thank you for your 5th visit, [[first_name]]! 💖 Your next service at [[business]] comes with a free add-on.'),
    ],
    recall: "Hi [[first_name]], it's about time for your next [[service]] at [[business]]. Reply here to book your slot. 😊",
    partySize: false,
    askBirthday: true,
  },
  {
    key: 'clinic',
    name: 'Clinic & dental',
    icon: 'stethoscope',
    blurb: 'Check-up and cleaning recalls, follow-up visits, feedback.',
    guest: 'Patient',
    guests: 'Patients',
    services: [
      { key: 'consultation', name: 'Consultation', days: null },
      { key: 'follow_up', name: 'Follow-up visit', days: 7 },
      { key: 'check_up', name: 'Routine check-up', days: 180 },
      { key: 'cleaning', name: 'Dental cleaning', days: 180 },
      { key: 'vaccination', name: 'Vaccination', days: 365 },
    ],
    fields: [
      { name: 'Doctor', type: 'text' },
      { name: 'Blood group', type: 'dropdown', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'Allergies', type: 'text' },
      { name: 'Insurance', type: 'text' },
    ],
    rules: [
      thanks(d(1), 'Hi [[first_name]], thank you for visiting [[business]]. We hope you are feeling well. If you have a moment, please share your feedback: [[review_link]]'),
      birthday(0, 'Happy birthday, [[first_name]]! Wishing you good health and a wonderful year ahead. – [[business]]'),
    ],
    recall: 'Hi [[first_name]], this is a reminder from [[business]] that your [[service]] is due. Reply here to book a convenient time.',
    partySize: false,
    askBirthday: true,
  },
  {
    key: 'gym',
    name: 'Gym & fitness',
    icon: 'dumbbell',
    blurb: 'Renewal reminders, win back members who stop coming.',
    guest: 'Member',
    guests: 'Members',
    services: [
      { key: 'trial', name: 'Trial session', days: 2 },
      { key: 'monthly', name: 'Monthly plan', days: 25 },
      { key: 'quarterly', name: 'Quarterly plan', days: 80 },
      { key: 'annual', name: 'Annual plan', days: 350 },
      { key: 'pt', name: 'Personal training', days: 30 },
    ],
    fields: [
      { name: 'Fitness goal', type: 'dropdown', options: ['Weight loss', 'Muscle gain', 'General fitness', 'Rehab'] },
      { name: 'Trainer', type: 'text' },
      { name: 'Membership ends', type: 'date' },
    ],
    rules: [
      thanks(h(2), 'Great session today, [[first_name]]! 💪 Keep it up. If you enjoy training at [[business]], a quick review helps us grow: [[review_link]]'),
      winBack(14, "Hi [[first_name]], we haven't seen you at [[business]] in 2 weeks. Your goals are waiting! 💪 Reply if you'd like help getting back on track."),
      birthday(0, 'Happy birthday, [[first_name]]! 🎂 Enjoy a free personal training session at [[business]] this month.'),
    ],
    recall: 'Hi [[first_name]], your [[service]] at [[business]] is due for renewal soon. Reply here to renew and keep your streak going. 🔥',
    partySize: false,
    askBirthday: true,
  },
  {
    key: 'auto',
    name: 'Auto service',
    icon: 'car',
    blurb: 'Service, alignment and wash reminders by vehicle.',
    guest: 'Customer',
    guests: 'Customers',
    services: [
      { key: 'car_service', name: 'Car service', days: 180 },
      { key: 'bike_service', name: 'Bike service', days: 90 },
      { key: 'alignment', name: 'Wheel alignment', days: 365 },
      { key: 'balancing', name: 'Wheel balancing', days: 90 },
      { key: 'wash', name: 'Wash', days: 15 },
    ],
    fields: [
      { name: 'Vehicle', type: 'text' },
      { name: 'Registration number', type: 'text' },
      { name: 'Odometer (km)', type: 'number' },
      { name: 'Insurance renewal', type: 'date' },
    ],
    rules: [thanks(d(1), 'Thank you for choosing [[business]], [[first_name]]! 🚗 How was the service? A quick review helps us: [[review_link]]')],
    recall: "Hi [[first_name]], your vehicle's [[service]] is due at [[business]]. Reply here to book a slot. 🔧",
    partySize: false,
    askBirthday: false,
  },
  {
    key: 'home',
    name: 'Home services & appliances',
    icon: 'wrench',
    blurb: 'AC, purifier, pest control and cleaning reminders.',
    guest: 'Customer',
    guests: 'Customers',
    services: [
      { key: 'ac', name: 'AC service', days: 180 },
      { key: 'purifier', name: 'Water purifier service', days: 90 },
      { key: 'filter', name: 'Filter change', days: 180 },
      { key: 'pest', name: 'Pest control', days: 90 },
      { key: 'cleaning', name: 'Deep cleaning', days: 90 },
    ],
    fields: [
      { name: 'Area', type: 'text' },
      { name: 'Appliance model', type: 'text' },
      { name: 'Warranty ends', type: 'date' },
    ],
    rules: [thanks(d(1), 'Thank you for choosing [[business]], [[first_name]]! We hope everything is working perfectly. A quick review helps us: [[review_link]]')],
    recall: "Hi [[first_name]], it's time for your next [[service]] from [[business]]. Reply here and we'll schedule a visit. 🛠️",
    partySize: false,
    askBirthday: false,
  },
  {
    key: 'retail',
    name: 'Retail store',
    icon: 'shopping',
    blurb: 'Thank-you, win-back offers, birthdays and loyal-customer rewards.',
    guest: 'Customer',
    guests: 'Customers',
    services: [
      { key: 'purchase', name: 'Purchase', days: null },
      { key: 'alteration', name: 'Alteration', days: null },
      { key: 'exchange', name: 'Exchange / return', days: null },
    ],
    fields: [
      { name: 'Size', type: 'text' },
      { name: 'Favourite category', type: 'text' },
    ],
    rules: [
      thanks(h(4), 'Thank you for shopping at [[business]], [[first_name]]! 🛍️ We hope you love it. A quick review helps us a lot: [[review_link]]'),
      winBack(45, "Hi [[first_name]], new arrivals are in at [[business]]! ✨ Drop by this week, we've kept some picks we think you'll like."),
      birthday(3, 'Happy birthday in advance, [[first_name]]! 🎁 Enjoy 15% off at [[business]] all of your birthday week.'),
      anniversary(3, 'Happy anniversary in advance, [[first_name]]! 💝 Find the perfect gift at [[business]], 10% off this week.'),
      milestone(5, 'Thank you for your 5th visit, [[first_name]]! 🎉 Your next purchase at [[business]] gets an extra 10% off.'),
    ],
    recall: null,
    partySize: false,
    askBirthday: true,
  },
  {
    key: 'pet',
    name: 'Pet care & vet',
    icon: 'paw',
    blurb: 'Grooming, vaccination and deworming reminders, pet birthdays.',
    guest: 'Pet parent',
    guests: 'Pet parents',
    services: [
      { key: 'grooming', name: 'Grooming', days: 30 },
      { key: 'vaccination', name: 'Vaccination', days: 365 },
      { key: 'deworming', name: 'Deworming', days: 90 },
      { key: 'check_up', name: 'Check-up', days: 180 },
      { key: 'boarding', name: 'Boarding', days: null },
    ],
    fields: [
      { name: 'Pet name', type: 'text' },
      { name: 'Species', type: 'dropdown', options: ['Dog', 'Cat', 'Bird', 'Other'] },
      { name: 'Breed', type: 'text' },
      { name: 'Pet birthday', type: 'date' },
    ],
    rules: [
      thanks(h(3), 'Thank you for visiting [[business]], [[first_name]]! 🐾 We loved having [[lead_x_pet_name]] over. A quick review helps us: [[review_link]]'),
      {
        key: 'pet_birthday',
        name: 'Pet birthday wishes',
        description: "On the pet's birthday, every year.",
        trigger: { kind: 'occasion', field: { userField: 'Pet birthday' }, daysBefore: 0 },
        steps: [{ wait: now, text: 'Happy birthday to [[lead_x_pet_name]]! 🎂🐶 Treat them to a free grooming add-on at [[business]] this month.' }],
        recommended: true,
      },
    ],
    recall: 'Hi [[first_name]], [[lead_x_pet_name]] is due for [[service]] at [[business]]. Reply here to book. 🐾',
    partySize: false,
    askBirthday: false,
  },
  {
    key: 'coaching',
    name: 'Coaching & classes',
    icon: 'graduation',
    blurb: 'Fee reminders, demo-class follow-ups, absent students.',
    guest: 'Student',
    guests: 'Students',
    services: [
      { key: 'demo', name: 'Demo class', days: 2 },
      { key: 'monthly_fee', name: 'Monthly fee', days: 28 },
      { key: 'quarterly_fee', name: 'Quarterly fee', days: 85 },
      { key: 'class', name: 'Class attended', days: null },
    ],
    fields: [
      { name: 'Course', type: 'text' },
      { name: 'Batch', type: 'text' },
      { name: 'Parent name', type: 'text' },
    ],
    rules: [
      winBack(10, "Hi [[first_name]], we've missed you in class at [[business]]. Is everything okay? Reply here if you need help catching up."),
      birthday(0, 'Happy birthday, [[first_name]]! 🎉 Wishing you a great year of learning. – [[business]]'),
    ],
    recall: 'Hi [[first_name]], a reminder from [[business]]: your [[service]] is due. Reply here if you have any questions.',
    partySize: false,
    askBirthday: true,
  },
  {
    key: 'other',
    name: 'Any other business',
    icon: 'store',
    blurb: 'Thank-you + review, win-back, birthdays and a loyalty reward.',
    guest: 'Customer',
    guests: 'Customers',
    services: [{ key: 'visit', name: 'Visit', days: null }],
    fields: [],
    rules: [
      thanks(h(3), 'Thank you for visiting [[business]], [[first_name]]! 😊 A quick review helps us a lot: [[review_link]]'),
      winBack(30, "Hi [[first_name]], it's been a while! We'd love to see you again at [[business]]."),
      birthday(0, 'Happy birthday, [[first_name]]! 🎉 A little treat is waiting for you at [[business]] this month.'),
      milestone(5, 'Thank you for your 5th visit, [[first_name]]! 🎉 Something special awaits you on your next visit to [[business]].'),
    ],
    recall: null,
    partySize: false,
    askBirthday: true,
  },
];

export const industryOf = (key: string | null | undefined): Industry | undefined => INDUSTRIES.find((i) => i.key === key);

/* ------------------------------ localization ------------------------------ */

type T = (key: string, opts?: Record<string, unknown>) => string;

/** A field's key in the translations: its English name as a slug (`Favourite dish` → `favourite_dish`). */
export const fieldKey = (englishName: string) =>
  englishName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** A rule's family in the translations: `milestone_5` → `milestone`. */
const family = (ruleKey: string) => (ruleKey.startsWith('milestone_') ? 'milestone' : ruleKey);

/**
 * The template in the app's language: names, descriptions and message wording
 * from the `visitTpl` translations, English (the catalogue above) where a
 * translation is missing. Tokens like `[[first_name]]` are the same in every
 * language, so what is created works the same.
 */
export const localizeIndustry = (i: Industry, t: T): Industry => {
  const tr = (key: string, fallback: string, opts: Record<string, unknown> = {}) => t(`visitTpl.${key}`, { ...opts, defaultValue: fallback });
  return {
    ...i,
    name: tr(`industry.${i.key}.name`, i.name),
    blurb: tr(`industry.${i.key}.blurb`, i.blurb),
    services: i.services.map((s) => ({ ...s, name: tr(`service.${i.key}.${s.key}`, s.name) })),
    fields: i.fields.map((f) => {
      const k = fieldKey(f.name);
      const options = f.options ? tr(`fieldOptions.${i.key}.${k}`, f.options.join('|')).split('|').map((o) => o.trim()).filter(Boolean) : undefined;
      return { ...f, en: f.name, name: tr(`field.${i.key}.${k}`, f.name), ...(options ? { options } : {}) };
    }),
    rules: i.rules.map((r) => {
      const fam = family(r.key);
      const count =
        r.trigger.kind === 'milestone' ? r.trigger.visits : r.trigger.kind === 'occasion' ? r.trigger.daysBefore : r.steps[0]?.wait.unit === 'days' ? r.steps[0].wait.value : 0;
      const descKey = fam === 'birthday' && count === 0 ? 'rule.birthday.descriptionOn' : `rule.${fam}.description`;
      return {
        ...r,
        name: tr(`rule.${fam}.name`, r.name, { count }),
        description: tr(descKey, r.description, { count }),
        steps: r.steps.map((st) => ({ ...st, text: tr(`msg.${i.key}.${r.key}`, st.text) })),
      };
    }),
    recall: i.recall ? tr(`msg.${i.key}.recall`, i.recall) : null,
    recallName: (service) => tr('rule.recall.name', `${service} reminder`, { service }),
    recallDescription: (service, days) => tr('rule.recall.description', `${days} days after each ${service.toLowerCase()}. Starts over at the next one.`, { service, count: days }),
  };
};

