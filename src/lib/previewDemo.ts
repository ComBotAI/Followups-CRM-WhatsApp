/**
 * Development only: which sample business web preview shows.
 *
 * `?preview=1` keeps the default (a hair & beauty salon); `?preview=bakery`
 * shows a home bakery and café. Add `-app` (`salon-app`, `bakery-app`) for the
 * same business sending through the WhatsApp app instead of the API. The choice
 * is remembered for the tab (sessionStorage) like preview mode itself.
 */
import { PACKS, type Pack } from './previewPacks';

export type DemoFlavor = 'salon' | 'bakery' | `pack-${string}`;

const KEY = 'fcrm:preview-demo';

const WA_KEY = 'fcrm:preview-wa';

export const demoFlavor = (): DemoFlavor => {
  if (typeof window === 'undefined') return 'salon';
  const q = new URLSearchParams(window.location.search).get('preview');
  if (q === 'bakery' || q === 'bakery-app') sessionStorage.setItem(KEY, 'bakery');
  if (q === 'salon' || q === 'salon-app') sessionStorage.setItem(KEY, 'salon');
  // `pack-<dir>`: an industry sample business (marketing screenshots), sending with the WhatsApp app.
  if (q?.startsWith('pack-') && PACKS[q.slice(5)]) {
    sessionStorage.setItem(KEY, q);
    sessionStorage.setItem(WA_KEY, 'phone');
  }
  const saved = sessionStorage.getItem(KEY);
  if (saved?.startsWith('pack-') && PACKS[saved.slice(5)]) return saved as DemoFlavor;
  // `-app`: the same business using the WhatsApp app on the phone instead of the WhatsApp API.
  if (q === 'bakery-app' || q === 'salon-app') sessionStorage.setItem(WA_KEY, 'phone');
  return sessionStorage.getItem(KEY) === 'bakery' ? 'bakery' : 'salon';
};

/** Whether the sample business uses the WhatsApp app (no API): no inbox or campaigns, messages sent by hand. */
export const demoUsesWhatsAppApp = () => typeof window !== 'undefined' && sessionStorage.getItem(WA_KEY) === 'phone';

type Demo = {
  workspace: string;
  owner: { first: string; last: string; email: string };
  team: { id: string; name: string; email: string; role: string }[];
  names: string[];
  cities: string[];
  products: string[];
  sources: string[];
  companies: string[];
  remarks: string[];
  tags: { id: string; name: string; color: string }[];
  chatLines: [string, string, string][];
  campaigns: { name: string; status: string; receivers: number; sent: number; hoursAgo: number; error?: string }[];
  templates: { name: string; category: string; status: string; body: string }[];
  quickReplies: { shortcut: string; message: string }[];
  channels: { wa: string; wa2: string; ig: [string, string]; sms: [string, string] };
  /** A board of the user's own, beside the built-in ones (slug, name, stages). */
  board?: { slug: string; name: string; stages: string[] };
  /** Services catalogue: name, usual price, comes back after (days). */
  services?: [string, number, number][];
  /** Visits industry template key. */
  industry?: string;
  /** Follow-up series: name, description, the service (index) that starts it, steps (wait in days, template, and the text sent with the WhatsApp app). */
  series?: { name: string; description: string; service: number; steps: [number, string, string?][] }[];
  /** Messages waiting in "WhatsApp to send" (WhatsApp app mode): series name, text ({first} is the first name). */
  taskTexts?: [string, string][];
};

export const DEMOS: Record<'salon' | 'bakery', Demo> = {
  salon: {
    workspace: 'Glow Studio',
    owner: { first: 'Priya', last: 'Sharma', email: 'priya@example.com' },
    team: [
      { id: 'preview', name: 'Priya Sharma', email: 'priya@example.com', role: 'Owner' },
      { id: 'm-arjun', name: 'Arjun Mehta', email: 'arjun@example.com', role: 'Stylist' },
      { id: 'm-neha', name: 'Neha Kapoor', email: 'neha@example.com', role: 'Front desk' },
      { id: 'm-vikram', name: 'Vikram Rao', email: 'vikram@example.com', role: 'Stylist' },
    ],
    names: [
      'Ananya Iyer',
      'Rahul Verma',
      'Meera Reddy',
      'Karan Malhotra',
      'Sneha Joshi',
      'Aditya Singh',
      'Pooja Nair',
      'Rohan Gupta',
      'Kavya Menon',
      'Siddharth Jain',
      'Divya Kulkarni',
      'Amit Patel',
      'Ritu Agarwal',
      'Nikhil Bose',
      'Isha Desai',
      'Varun Chopra',
      'Tanvi Shah',
      'Manish Yadav',
      'Shreya Pillai',
      'Gaurav Mishra',
      'Nisha Thakur',
      'Harsh Vardhan',
      'Aarti Bhatt',
      'Yash Saxena',
    ],
    cities: ['Koregaon Park', 'Baner', 'Aundh', 'Kalyani Nagar', 'Viman Nagar', 'Kothrud', 'Wakad', 'Hadapsar'],
    products: ['Haircut', 'Hair colour', 'Facial', 'Hair spa', 'Bridal package'],
    sources: ['Walk-in', 'Instagram', 'Google', 'Referral', 'WhatsApp'],
    companies: ['', '', '', '', '', '', '', '', '', ''],
    remarks: [
      'Prefers Arjun for haircuts',
      'Global colour, shade 6.3 golden brown',
      'Sensitive skin: no fragrance products',
      'Wants a bridal trial in December',
      'Comes every month, Saturday mornings',
      'Asked about the hair spa membership',
    ],
    tags: [
      { id: 'tag1', name: 'VIP', color: '#F59E0B' },
      { id: 'tag2', name: 'Bridal', color: '#DB2777' },
      { id: 'tag3', name: 'Membership', color: '#16A34A' },
    ],
    chatLines: [
      ['Hi, can I book a haircut for Saturday 11 am?', 'Done! Saturday 11 am with Arjun ✂️', 'Great, thank you 🙏'],
      ['What time do you open on Sunday?', 'We open at 10 am on Sundays.', 'Perfect, see you then'],
      ['Can I move my facial to Friday?', 'Done, Friday 4 pm is booked for you ✨', 'Thanks a lot!'],
      ['Please share the bridal package details', 'Sharing them now 💍', 'Looks lovely, booking a trial'],
      ['Loved my new colour! 😍', 'So happy you loved it! See you next month 💖', '100%'],
    ],
    campaigns: [
      { name: 'Diwali glow offer', status: 'completed', receivers: 420, sent: 420, hoursAgo: 144 },
      { name: 'New bridal packages', status: 'processing', receivers: 180, sent: 96, hoursAgo: 3 },
      { name: 'Weekend slots open', status: 'pending', receivers: 64, sent: 0, hoursAgo: -48 },
      { name: 'We miss you: 10% off', status: 'completed', receivers: 125, sent: 125, hoursAgo: 288 },
    ],
    templates: [
      { name: 'next_visit', category: 'MARKETING', status: 'APPROVED', body: 'Hi {{1}}, it’s about time for your next {{2}} ✂️ Reply here to book your slot.' },
      { name: 'appointment_reminder', category: 'UTILITY', status: 'APPROVED', body: 'Hi {{1}}, a reminder of your appointment on {{2}} at {{3}}.' },
      { name: 'birthday_treat', category: 'MARKETING', status: 'APPROVED', body: 'Happy birthday {{1}}! 🎉 Enjoy 20% off any service this month.' },
      { name: 'review_request', category: 'MARKETING', status: 'APPROVED', body: 'Thank you for visiting, {{1}}! ✨ A quick review would mean a lot to us.' },
    ],
    quickReplies: [
      { shortcut: 'price', message: 'Haircut ₹450, hair colour from ₹2,200, facials from ₹1,200. Shall I send the full menu?' },
      { shortcut: 'address', message: 'We are at 2nd floor, Lane 5, Koregaon Park, Pune.' },
      { shortcut: 'timing', message: 'We are open 10 am to 8 pm, every day except Tuesday.' },
    ],
    channels: { wa: 'Glow Studio', wa2: 'Bookings', ig: ['Glow Studio', 'glowstudio.pune'], sms: ['Offers', 'GLOWST'] },
    industry: 'salon',
    services: [
      ['Haircut', 450, 30],
      ['Hair colour', 2200, 45],
      ['Facial', 1200, 30],
      ['Beard trim', 200, 14],
      ['Hair spa', 1500, 30],
    ],
    series: [
      {
        name: 'Haircut due in 4 weeks',
        description: 'Reminds clients when their next haircut is due, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [28, 'next_visit', 'Hi [[first_name]] ✂️ It’s been 4 weeks since your last haircut at [[business]]. Shall I book your usual slot?'],
          [7, 'next_visit', 'Hi [[first_name]], we have a few slots open this weekend 😊 Reply here and I’ll book one for you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a colour, thanks the client and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'review_request',
            'Thank you for visiting [[business]], [[first_name]]! ✨ Loved your new colour? A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    taskTexts: [
      ['Haircut due in 4 weeks', 'Hi {first} ✂️ It’s been 4 weeks since your last haircut at Glow Studio. Shall I book your usual Saturday slot with Arjun?'],
      [
        'Thank you + Google review',
        'Thank you for visiting Glow Studio today, {first}! ✨ Loved your new look? A quick Google review helps us a lot: g.page/glowstudio',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A treat from Glow Studio: 20% off any service this month. Just reply to book.'],
    ],
  },
  bakery: {
    workspace: 'Crumb & Co. Bakery',
    owner: { first: 'Ritika', last: 'Kapoor', email: 'ritika@crumbandco.in' },
    team: [
      { id: 'preview', name: 'Ritika Kapoor', email: 'ritika@crumbandco.in', role: 'Owner' },
      { id: 'm-arjun', name: 'Sameer Khan', email: 'sameer@crumbandco.in', role: 'Sales person' },
      { id: 'm-neha', name: 'Fatima Shaikh', email: 'fatima@crumbandco.in', role: 'Follow-up agent' },
      { id: 'm-vikram', name: 'Joel D’Souza', email: 'joel@crumbandco.in', role: 'Support' },
    ],
    names: [
      'Ananya Iyer',
      'Rahul Verma',
      'Meera Reddy',
      'Kabir Malhotra',
      'Sneha Joshi',
      'Aditya Singh',
      'Pooja Nair',
      'Rohan Gupta',
      'Zara Sheikh',
      'Kavya Menon',
      'Amit Patel',
      'Divya Kulkarni',
      'Nikhil Bose',
      'Ritu Agarwal',
      'Varun Chopra',
      'Isha Desai',
      'Manish Yadav',
      'Tanvi Shah',
      'Gaurav Mishra',
      'Shreya Pillai',
      'Harsh Vardhan',
      'Nisha Thakur',
      'Yash Saxena',
      'Aarti Bhatt',
    ],
    cities: ['Bandra', 'Andheri', 'Powai', 'Juhu', 'Khar', 'Santacruz', 'Worli', 'Goregaon'],
    products: ['Custom cake', 'Brownie box', 'Sourdough loaf', 'Cupcakes (12)', 'Party catering'],
    sources: ['Walk-in', 'Instagram', 'WhatsApp', 'Website', 'Referral', 'Google'],
    companies: ['', '', 'Bright Minds School', '', 'Nexa Studios', '', '', 'Kapoor Events', '', ''],
    remarks: [
      'Wants a 2 kg chocolate truffle cake for Saturday',
      'Asked for an eggless option',
      'Loved the brownie box, will order again',
      'Office order: 40 cupcakes every Friday',
      'Birthday on the 14th, send designs',
      'Asked for the Diwali hamper price',
    ],
    tags: [
      { id: 'tag1', name: 'Regular', color: '#16A34A' },
      { id: 'tag2', name: 'Eggless', color: '#F59E0B' },
      { id: 'tag3', name: 'Office order', color: '#2563EB' },
      { id: 'tag4', name: 'Birthday', color: '#DB2777' },
    ],
    chatLines: [
      [
        'Hi! Can I order a 2 kg chocolate truffle cake for Saturday? 🎂',
        'Yes Ananya! Saturday 5 pm pickup works. Any message on the cake?',
        '“Happy 30th Rahul” please, and eggless 🙏',
      ],
      ['Is the sourdough available today?', 'Fresh batch out at 11 am, shall I keep one aside for you?', 'Yes please, I’ll pick it up at 1'],
      ['Do you deliver to Powai?', 'We do! ₹60 within 6 km, free above ₹999.', 'Perfect, sending my order now'],
      ['Need 40 cupcakes for our office on Friday', 'Happy to! Mixed flavours at ₹55 each. Shall I share the menu?', 'Yes, send it over'],
      ['Thank you, the cake was amazing! 😍', 'So glad you loved it! See you again soon 💛', '100% ordering for Diwali too'],
      ['Can I get the Diwali hamper menu?', 'Sharing it now! Hampers start at ₹1,200 with free delivery till the 25th.', 'Booking 3 hampers for my team 🪔'],
      ['Is the brownie box nut-free?', 'We have a nut-free box at ₹520, baked separately.', 'Great, one nut-free box please'],
      ['What time can I pick up my order?', 'It’ll be ready by 6 pm today 🎉', 'Perfect, coming at 6:15'],
      ['Do you do birthday cakes with photo print?', 'Yes! Photo cakes from ₹1,400 for 1 kg. Send us the photo here.', 'Sending the photo now 📸'],
      ['Can you cater 60 people for a housewarming?', 'Absolutely, our party platter is ₹380 per person. Which date?', 'Sunday the 9th, around 1 pm'],
      ['Are cupcakes available tomorrow?', 'Yes, red velvet and Belgian chocolate ✨', 'Keep 6 of each for me please'],
      ['Do you have sugar-free options?', 'Our sugar-free banana walnut loaf is ₹450.', 'I’ll take two loaves'],
    ],
    campaigns: [
      { name: 'Diwali hampers: pre-order now', status: 'completed', receivers: 640, sent: 640, hoursAgo: 120 },
      { name: 'Weekend brunch is back', status: 'processing', receivers: 310, sent: 182, hoursAgo: 2 },
      { name: 'Christmas plum cake pre-orders', status: 'pending', receivers: 512, sent: 0, hoursAgo: -72 },
      { name: 'We miss you: 10% off this week', status: 'completed', receivers: 148, sent: 148, hoursAgo: 360 },
    ],
    templates: [
      {
        name: 'order_again',
        category: 'MARKETING',
        status: 'APPROVED',
        body: 'Hi {{1}}, it’s been a few weeks since your last order 🍰 Your favourite {{2}} is fresh today. Reply ORDER and we’ll keep one ready!',
      },
      { name: 'order_ready', category: 'UTILITY', status: 'APPROVED', body: 'Hi {{1}}, your order is ready for pickup at Crumb & Co. 🎉 See you soon!' },
      {
        name: 'festive_preorder',
        category: 'MARKETING',
        status: 'APPROVED',
        body: 'Diwali hampers are here ✨ Pre-order by the 25th and get free delivery. Reply MENU to see them.',
      },
      {
        name: 'feedback_request',
        category: 'MARKETING',
        status: 'APPROVED',
        body: 'Hi {{1}}, how was your {{2}}? A quick reply helps our small kitchen a lot 💛',
      },
    ],
    quickReplies: [
      { shortcut: 'menu', message: 'Here’s this week’s menu 🍰 Cakes from ₹650, brownie boxes ₹480, cupcakes ₹55 each.' },
      { shortcut: 'delivery', message: 'We deliver within 6 km for ₹60, and free on orders above ₹999.' },
      { shortcut: 'timing', message: 'Open 9 am – 10 pm every day. Custom cakes need 24 hours’ notice.' },
      { shortcut: 'payment', message: 'Please pay 50% advance to confirm: UPI crumbandco@upi' },
    ],
    channels: { wa: 'Crumb & Co. Orders', wa2: 'Catering desk', ig: ['Crumb & Co.', 'crumbandco.bakes'], sms: ['Offers', 'CRUMBC'] },
    board: { slug: 'lead_x_order_stage', name: 'Cake orders', stages: ['Enquiry', 'Design shared', 'Advance paid', 'Baking', 'Ready', 'Delivered'] },
    services: [
      ['Order', 850, 21],
      ['Custom cake', 1800, 60],
      ['Dine-in visit', 600, 14],
      ['Catering', 12000, 90],
    ],
    industry: 'restaurant',
    series: [
      {
        name: 'Order again in 3 weeks',
        description: 'Reminds regulars to reorder three weeks after their last order, then once more a week later.',
        service: 0,
        steps: [
          [21, 'order_again'],
          [7, 'feedback_request'],
        ],
      },
      {
        name: 'Birthday cake: ask for next year',
        description: 'Eleven months after a custom cake, offers the next birthday cake.',
        service: 1,
        steps: [[330, 'festive_preorder']],
      },
    ],
    taskTexts: [
      [
        'Order again in 3 weeks',
        'Hi {first} 🍰 It’s been 3 weeks since your last order! Your favourite chocolate truffle is fresh today. Reply ORDER and we’ll keep one ready.',
      ],
      ['Order again in 3 weeks', 'Hi {first}, fresh brownie boxes just came out of the oven 😋 Want us to set one aside for you this weekend?'],
      ['Order again in 3 weeks', 'Hi {first}! How was your order last time? 💛 Diwali hampers are now open for pre-order with free delivery.'],
    ],
  },
};

/** An industry pack laid over the salon sample (people, chats, templates), with its own business, services and messages. */
const fromPack = (p: Pack): Demo => {
  const base = DEMOS.salon;
  const [first, last] = p.owner;
  const mail = (name: string) => `${name.split(' ')[0].toLowerCase()}@example.com`;
  return {
    ...base,
    workspace: p.workspace,
    owner: { first, last, email: mail(first) },
    team: [
      { id: 'preview', name: `${first} ${last}`, email: mail(first), role: 'Owner' },
      ...p.team.map(([name, role], i) => ({ id: ['m-arjun', 'm-neha', 'm-vikram'][i] ?? `m-${i}`, name, email: mail(name), role })),
    ],
    products: p.services.map((x) => x[0]),
    remarks: p.remarks,
    channels: { ...base.channels, wa: p.workspace, ig: [p.workspace, p.handle] },
    industry: p.template,
    services: p.services.map(([name, price, days]) => [name, price, days ?? 0]),
    series: p.series.map((x, n) => ({
      name: x.name,
      description: x.description,
      service: x.service,
      steps: x.steps.map(([days, text]) => [days, n === 0 ? 'next_visit' : 'review_request', text] as [number, string, string]),
    })),
    taskTexts: p.tasks,
  };
};

export const demo = (): Demo => {
  const f = demoFlavor();
  return f.startsWith('pack-') ? fromPack(PACKS[f.slice(5)]) : DEMOS[f as 'salon' | 'bakery'];
};
