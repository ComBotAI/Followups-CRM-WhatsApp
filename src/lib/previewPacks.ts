/**
 * Development only: sample businesses for web preview (`?preview=pack-<dir>`), one per
 * marketing industry. Generated from marketing/<industry>/source/demo.json by
 * marketing/_build/gen_packs.py: edit those, not this file.
 */
export type Pack = {
  dir: string;
  template: string;
  label: string;
  workspace: string;
  owner: [string, string];
  team: [string, string][];
  services: [string, number, number | null][];
  series: { name: string; description: string; service: number; steps: [number, string][] }[];
  tasks: [string, string][];
  remarks: string[];
  handle: string;
};

export const PACKS: Record<string, Pack> = {
  'auto-service': {
    dir: 'auto-service',
    template: 'auto',
    label: 'Auto service',
    workspace: 'Speedline Auto Care',
    owner: ['Rakesh', 'Patil'],
    team: [
      ['Imran Shaikh', 'Senior mechanic'],
      ['Pooja Nair', 'Service advisor'],
      ['Sunil Yadav', 'Bike mechanic'],
    ],
    services: [
      ['Car service', 3500, 180],
      ['Bike service', 900, 90],
      ['Wheel alignment', 600, 180],
      ['Car wash', 400, 30],
      ['AC gas refill', 2500, null],
    ],
    series: [
      {
        name: 'Car service due in 6 months',
        description: "Reminds customers when their car's next periodic service is due, then a gentle nudge a week later.",
        service: 0,
        steps: [
          [
            180,
            'Hi [[first_name]] 🚗 It’s been 6 months since your car’s last service at [[business]]. Due soon, or near 5,000 km? Reply and we’ll fix a slot.',
          ],
          [7, 'Hi [[first_name]], just a reminder that your car service is due. We have slots open this week. Reply here to book.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a bike service, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [0.125, 'Thank you for choosing [[business]], [[first_name]]! 🏍️ Hope the bike is running smooth. A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'Car service due in 6 months',
        'Hi {first} 🚗 It’s been 6 months since your Swift’s last service at Speedline Auto Care. Shall I book you in with Imran this Saturday morning?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Speedline Auto Care today, {first}! Hope the bike feels smooth again. A quick Google review helps us a lot: g.page/speedlineauto',
      ],
      [
        'Birthday treat',
        'Happy birthday, {first}! 🎉 From all of us at Speedline Auto Care: a foam wash on us with your next service this month. Just reply to book.',
      ],
    ],
    remarks: [
      'Swift Dzire, petrol, prefers Imran',
      'Uses synthetic oil only',
      'Activa 6G, comes every 3 months',
      'Asked for pick-up and drop from office',
      'Front tyres need changing next visit',
      'Wants a quote for ceramic coating',
    ],
    handle: 'speedlineauto',
  },
  'bakery-cafe': {
    dir: 'bakery-cafe',
    template: 'restaurant',
    label: 'Restaurant & café',
    workspace: 'Butter & Crumb',
    owner: ['Kavya', 'Reddy'],
    team: [
      ['Meera Joshi', 'Baker'],
      ['Farah Khan', 'Cake decorator'],
      ['Rohan Das', 'Café counter'],
    ],
    services: [
      ['Brownie box', 480, 21],
      ['Custom cake', 1800, null],
      ['Cupcake box', 600, 30],
      ['Cookie jar', 350, 21],
      ['Cold coffee', 180, 7],
    ],
    series: [
      {
        name: 'Brownie reorder in 3 weeks',
        description: 'Reminds customers to reorder their brownie box three weeks later, then a gentle nudge a week after.',
        service: 0,
        steps: [
          [21, 'Hi [[first_name]] 🍫 It’s been 3 weeks since your brownie box from [[business]]. Running low? Shall I bake a fresh batch for you?'],
          [7, 'Hi [[first_name]], fresh brownies are coming out of the oven this Friday 😊 Reply here and I’ll keep a box aside for you.'],
        ],
      },
      {
        name: 'Cake thank you + review',
        description: 'Three hours after a custom cake, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for ordering your cake from [[business]], [[first_name]]! 🎂 Hope everyone loved it. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Brownie reorder in 3 weeks',
        'Hi {first} 🍫 It’s been 3 weeks since your brownie box from Butter & Crumb. Shall I bake your usual walnut fudge batch this Friday?',
      ],
      [
        'Cake thank you + review',
        'Thank you for ordering your cake from Butter & Crumb, {first}! 🎂 Hope the party was lovely. A quick Google review helps us a lot: g.page/butterandcrumb',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A little treat from Butter & Crumb: a free cupcake with any order this week. Just reply to order.'],
    ],
    remarks: [
      'Eggless only, for the whole family',
      'Walnut fudge brownies, box of 9',
      "Daughter's birthday 3 May: unicorn cake last year",
      'Less sugar, no fondant',
      'Picks up after office, around 7 pm',
      'Asked about a monthly office order',
    ],
    handle: 'butterandcrumb',
  },
  boutique: {
    dir: 'boutique',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Rangoli Boutique',
    owner: ['Kavita', 'Agarwal'],
    team: [
      ['Farida Ansari', 'Master tailor'],
      ['Meera Joshi', 'Sales'],
      ['Lakshmi Reddy', 'Tailor'],
    ],
    services: [
      ['Purchase', 2500, 45],
      ['Blouse stitching', 900, null],
      ['Alteration', 300, null],
      ['Suit stitching', 1400, null],
      ['Fall & pico', 250, null],
    ],
    series: [
      {
        name: 'New arrivals after 45 days',
        description: 'About six weeks after a purchase, invites customers to see the new collection, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            45,
            'Hi [[first_name]] 🌸 Our new collection has just arrived at [[business]]: fresh kurtas, suits and festive sarees. Shall I send you a few pictures?',
          ],
          [7, 'Hi [[first_name]], the new pieces are going fast. Drop by this week, or reply here and I’ll keep your size aside.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after blouse stitching, thanks the customer and asks for a review.',
        service: 1,
        steps: [[0.125, 'Thank you for choosing [[business]], [[first_name]]! 🧵 Hope you love the fit. A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'New arrivals after 45 days',
        'Hi {first} 🌸 Our new festive collection has just arrived at Rangoli Boutique, with lots of the pastel suits you love. Shall I send you a few pictures?',
      ],
      [
        'Thank you + Google review',
        'Thank you for shopping at Rangoli Boutique today, {first}! Hope you love the blouse fit. A quick Google review helps us a lot: g.page/rangoliboutique',
      ],
      [
        'Birthday treat',
        "Happy birthday, {first}! 🎉 A little gift from Rangoli Boutique: 10% off anything in store this month. Come by, we'd love to see you.",
      ],
    ],
    remarks: [
      'Blouse size 36, prefers deep back',
      'Loves pastels and chikankari',
      "Daughter's wedding in February",
      'Measurements taken by Farida',
      'Likes cotton kurtas for office',
      'Wants lehenga options under ₹15,000',
    ],
    handle: 'rangoliboutique',
  },
  'car-wash': {
    dir: 'car-wash',
    template: 'auto',
    label: 'Auto service',
    workspace: 'ShineBay Car Spa',
    owner: ['Karan', 'Malhotra'],
    team: [
      ['Sajid Ansari', 'Senior detailer'],
      ['Nikhil Rawat', 'Wash bay lead'],
      ['Ritu Malhotra', 'Front desk'],
    ],
    services: [
      ['Ceramic coating', 25000, 90],
      ['Foam wash', 500, 15],
      ['Interior clean', 2000, 120],
      ['Wax polish', 1200, 60],
      ['PPF', 70000, null],
    ],
    series: [
      {
        name: 'Ceramic care due in 3 months',
        description: 'Three months after a ceramic coating, reminds the customer about the maintenance wash, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            90,
            "Hi [[first_name]] ✨ It's been 3 months since your car's ceramic coating at [[business]]. Time for the maintenance wash we recommended. Shall I book a slot?",
          ],
          [7, "Hi [[first_name]], a quick nudge 😊 Your ceramic maintenance wash is due. Weekday mornings are usually easy to get. Reply and I'll book one."],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'An hour after a foam wash, thanks the customer and asks for a review.',
        service: 1,
        steps: [[0.04, 'Thank you for visiting [[business]], [[first_name]]! ✨ Loved the shine? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'Ceramic care due in 3 months',
        "Hi {first} ✨ It's been 3 months since your Creta's ceramic coating at ShineBay Car Spa. Time for the maintenance wash we recommended. Shall I book a weekday morning with Sajid?",
      ],
      [
        'Thank you + Google review',
        'Thank you for visiting ShineBay Car Spa today, {first}! ✨ Loved the shine? A quick Google review helps us a lot: g.page/shinebay',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A treat from ShineBay Car Spa: 20% off an interior cleaning this month. Just reply to book.'],
    ],
    remarks: [
      'Black Creta: ceramic done in August',
      'No tyre shine, please',
      'Pet hair on rear seat: extra vacuum',
      'Comes early Sunday, before the rush',
      'Asked about PPF for a new car',
      'No air freshener in the car',
    ],
    handle: 'shinebay',
  },
  clinic: {
    dir: 'clinic',
    template: 'clinic',
    label: 'Clinic & dental',
    workspace: 'Arogya Family Clinic',
    owner: ['Anil', 'Verma'],
    team: [
      ['Sunita Rao', 'Physician'],
      ['Pooja Nair', 'Receptionist'],
      ['Ramesh Kumar', 'Nurse'],
    ],
    services: [
      ['Follow-up visit', 400, 14],
      ['Consultation', 500, null],
      ['Annual check-up', 1800, 365],
      ['BP check', 100, 30],
      ['Blood test', 650, null],
    ],
    series: [
      {
        name: 'Follow-up due in 2 weeks',
        description: 'Reminds patients when their follow-up visit is due, then a gentle reminder a few days later.',
        service: 0,
        steps: [
          [
            14,
            'Namaste [[first_name]] 🙏 This is [[business]]. Your follow-up visit is due this week. Reply with a time that suits you and we’ll keep a slot.',
          ],
          [4, 'Hi [[first_name]], just a gentle reminder from [[business]] about your follow-up visit. Reply here whenever you’d like to come in.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a consultation, thanks the patient and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for visiting [[business]] today, [[first_name]]. 🙏 If you were happy with your visit, a quick review helps other families find us: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Follow-up due in 2 weeks',
        'Namaste {first} 🙏 This is Arogya Family Clinic. Your follow-up visit with Dr. Verma is due this week. Would Thursday evening suit you?',
      ],
      [
        'Thank you + Google review',
        'Thank you for visiting Arogya Family Clinic today, {first}. 🙏 If you were happy with your visit, a quick Google review helps us a lot: g.page/arogyaclinic',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Warm wishes from Dr. Verma and the whole team at Arogya Family Clinic. Have a lovely day.'],
    ],
    remarks: [
      'Prefers evening slots after 6 pm',
      'Comes with her mother, Mrs. Kamala Iyer',
      'Speaks Tamil and English',
      'Fasting tests: comes in before 9 am',
      'Needs ground-floor room, uses a walker',
      'Whole family registered: 4 members',
    ],
    handle: 'arogyaclinic',
  },
  'clothing-store': {
    dir: 'clothing-store',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Navrang Family Fashion',
    owner: ['Rajesh', 'Khandelwal'],
    team: [
      ['Sunita Verma', 'Sales'],
      ['Imran Qureshi', 'Kids section'],
      ['Deepak Saini', 'Billing counter'],
    ],
    services: [
      ['Purchase', 3200, 60],
      ['Festive wear', 5500, null],
      ['Kids wear', 1200, null],
      ["Men's formals", 2800, null],
      ['Alteration', 150, null],
    ],
    series: [
      {
        name: 'New season after 60 days',
        description: 'About two months after a purchase, invites customers to see the new season collection, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            60,
            'Hi [[first_name]] 👕 The new season collection is here at [[business]]: fresh kurtas, shirts and kidswear for the whole family. Shall I send you a few pictures?',
          ],
          [7, 'Hi [[first_name]], the new styles are going fast and sizes are limited. Drop by this week, or reply here and I’ll keep your sizes aside.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after festive shopping, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for shopping at [[business]], [[first_name]]! 🎉 Hope the family loves the festive outfits. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'New season after 60 days',
        'Hi {first} 👕 The new festive collection is here at Navrang Family Fashion, with ethnic sets in your son’s size too. Shall I send you a few pictures?',
      ],
      [
        'Thank you + Google review',
        'Thank you for shopping at Navrang Family Fashion today, {first}! Hope the family loves the festive outfits. A quick Google review helps us a lot: g.page/navrangfashion',
      ],
      [
        'Birthday treat',
        'Happy birthday, {first}! 🎉 A little gift from Navrang Family Fashion: 10% off anything in store this month. Come by with the family.',
      ],
    ],
    remarks: [
      'Shirt size 40, trousers 34 waist',
      'Two kids: girl 6, boy 10',
      'Wife likes Anarkali kurtas, size L',
      'Shops for the whole family every Diwali',
      "Needs a sherwani for brother's wedding in Jan",
      'Prefers cotton for summer',
    ],
    handle: 'navrangfashion',
  },
  coaching: {
    dir: 'coaching',
    template: 'coaching',
    label: 'Coaching & classes',
    workspace: 'Shiksha Point Classes',
    owner: ['Suresh', 'Kulkarni'],
    team: [
      ['Anita Menon', 'Maths teacher'],
      ['Rahul Bose', 'Science teacher'],
      ['Swati Jain', 'Office admin'],
    ],
    services: [
      ['Monthly fee', 3000, 28],
      ['Demo class', 0, 2],
      ['Quarterly fee', 8500, 85],
      ['Crash course', 6000, null],
      ['Doubt session', 300, null],
    ],
    series: [
      {
        name: 'Monthly fee reminder',
        description: "A polite reminder when next month's fee is due, then a gentle follow-up a few days later.",
        service: 0,
        steps: [
          [
            28,
            'Namaste [[first_name]] 📚 A gentle reminder from [[business]]: next month’s fee is due this week. Please ignore this if it’s already done. Thank you!',
          ],
          [4, 'Hi [[first_name]], just a friendly follow-up on this month’s fee at [[business]]. If you need a few more days, simply reply here. Thank you!'],
        ],
      },
      {
        name: 'Demo thank you + review',
        description: 'Three hours after a demo class, thanks the student and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for attending the demo class at [[business]], [[first_name]]! 🙏 We hope you enjoyed it. Any questions about batches, just reply. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Monthly fee reminder',
        'Namaste {first} 📚 A gentle reminder from Shiksha Point Classes: next month’s fee for Aarav’s Class 9 Maths batch is due this week. Please ignore this if it’s already done. Thank you!',
      ],
      [
        'Demo thank you + review',
        'Thank you for attending the demo class at Shiksha Point Classes today, {first}! Any questions about the evening batch, just reply here. A quick Google review helps us a lot: g.page/shikshapoint',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎉 Wishing you a wonderful year of learning from all your teachers at Shiksha Point Classes.'],
    ],
    remarks: [
      'Class 10 CBSE, Maths + Science',
      'Evening batch, 6 to 8 pm',
      'Father pays the fee, call him first',
      'Weak in algebra, extra practice sheets',
      'Brother also wants a demo class',
      'Preparing for JEE Foundation',
    ],
    handle: 'shikshapoint',
  },
  dental: {
    dir: 'dental',
    template: 'clinic',
    label: 'Clinic & dental',
    workspace: 'Dantam Dental Studio',
    owner: ['Neha', 'Kulkarni'],
    team: [
      ['Aditya Shah', 'Dentist'],
      ['Swati Pawar', 'Front desk'],
      ['Manoj Gupta', 'Dental assistant'],
    ],
    services: [
      ['Cleaning', 1200, 180],
      ['Check-up', 500, 180],
      ['Filling', 1500, null],
      ['Braces review', 1000, 30],
      ['Whitening', 8000, null],
    ],
    series: [
      {
        name: 'Cleaning due in 6 months',
        description: 'Reminds patients when their 6-monthly cleaning and check-up is due, then a gentle reminder 10 days later.',
        service: 0,
        steps: [
          [180, 'Hi [[first_name]] 😁 It’s been 6 months since your last cleaning at [[business]]. Your cleaning and check-up are due. Shall we fix a time?'],
          [10, 'Hi [[first_name]], a gentle reminder from [[business]] that your 6-monthly cleaning is due. Reply here and we’ll find a slot that suits you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after whitening, thanks the patient and asks for a review.',
        service: 4,
        steps: [
          [0.125, 'Thank you for visiting [[business]], [[first_name]]! ✨ Enjoying your brighter smile? A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'Cleaning due in 6 months',
        'Hi {first} 😁 It’s been 6 months since your last cleaning at Dantam Dental Studio. Shall I book your usual Saturday morning with Dr. Shah?',
      ],
      [
        'Thank you + Google review',
        'Thank you for visiting Dantam Dental Studio today, {first}! ✨ Happy with your smile? A quick Google review helps us a lot: g.page/dantamdental',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Keep smiling, from Dr. Kulkarni and everyone at Dantam Dental Studio.'],
    ],
    remarks: [
      'Nervous patient: explain each step',
      'Prefers Dr. Shah, Saturday mornings',
      'Braces since March, monthly review',
      'Son Aarav (7) is also a patient',
      'Sensitive to cold on the lower left',
      'Asked about whitening before her wedding',
    ],
    handle: 'dantamdental',
  },
  'diagnostic-lab': {
    dir: 'diagnostic-lab',
    template: 'clinic',
    label: 'Clinic & dental',
    workspace: 'Sahyog Pathology Lab',
    owner: ['Meera', 'Kulkarni'],
    team: [
      ['Imran Shaikh', 'Lab technician'],
      ['Sunil Yadav', 'Phlebotomist'],
      ['Kavya Menon', 'Front desk'],
    ],
    services: [
      ['3-month repeat', 900, 90],
      ['Home collection', 150, null],
      ['6-month repeat', 900, 180],
      ['Yearly repeat', 1500, 365],
      ['Walk-in test', 500, null],
    ],
    series: [
      {
        name: 'Repeat test in 3 months',
        description: 'A week before the repeat test the doctor advised is due, sends a polite reminder, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            83,
            'Namaste [[first_name]] 🙏 This is [[business]]. As advised by your doctor, your repeat test is due next week. Reply with a time for home collection or a visit.',
          ],
          [7, 'Hi [[first_name]], a gentle reminder from [[business]] about your repeat test. Reply here whenever you’d like us to collect the sample.'],
        ],
      },
      {
        name: 'Thank you + next repeat',
        description: "An hour after a home collection, thanks the patient and says you'll remind them before the next repeat.",
        service: 1,
        steps: [
          [
            0.04,
            'Thank you for choosing [[business]] today, [[first_name]] 🙏 If your doctor has advised a repeat test, we’ll send you a gentle reminder before it’s due.',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Repeat test in 3 months',
        'Namaste {first} 🙏 This is Sahyog Pathology Lab. As advised by your doctor, your repeat test is due next week. Shall Sunil come home for the sample on Saturday at 7:30 am?',
      ],
      [
        'Thank you + next repeat',
        'Thank you for choosing Sahyog Pathology Lab today, {first} 🙏 If your doctor has advised a repeat test, we’ll send you a gentle reminder before it’s due.',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Warm wishes from Dr. Kulkarni and the whole team at Sahyog Pathology Lab. Have a lovely day.'],
    ],
    remarks: [
      'Home collection only, 7 am',
      'Father, 74: needs a chair',
      'Prefers Sunil for home visits',
      'Referred by Dr. Patel',
      'Speaks Gujarati and Hindi',
      'Whole family registered: 4 members',
    ],
    handle: 'sahyoglab',
  },
  footwear: {
    dir: 'footwear',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Kadam Shoe Centre',
    owner: ['Sanjay', 'Bansal'],
    team: [
      ['Rohit Yadav', 'Sales'],
      ['Pooja Nair', 'Billing'],
      ['Salim Shaikh', 'Kids section'],
    ],
    services: [
      ['Purchase', 1800, 90],
      ['School shoes', 1200, null],
      ['Sports shoes', 3500, null],
      ['Formal shoes', 2800, null],
      ['Sandals', 900, null],
    ],
    series: [
      {
        name: 'New arrivals after 90 days',
        description: "About three months after a purchase, invites customers to see new arrivals (and check the kids' size), then a gentle nudge a week later.",
        service: 0,
        steps: [
          [
            90,
            'Hi [[first_name]] 👟 New arrivals are in at [[business]]: sports shoes, sandals and school shoes for the new term. Kids’ feet grow fast, shall I keep the next size aside?',
          ],
          [7, 'Hi [[first_name]], the popular sizes are going fast. Drop by this week for a quick fitting, or reply here and I’ll keep a pair aside.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after buying sports shoes, thanks the customer and asks for a review.',
        service: 2,
        steps: [
          [0.125, 'Thank you for shopping at [[business]], [[first_name]]! 👟 Hope the new shoes feel great. A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'New arrivals after 90 days',
        'Hi {first} 👟 New school shoes are in at Kadam Shoe Centre for the new term. Aarav was a size 4 last time, shall I keep a size 5 aside?',
      ],
      [
        'Thank you + Google review',
        'Thank you for shopping at Kadam Shoe Centre today, {first}! Hope the new shoes feel great. A quick Google review helps us a lot: g.page/kadamshoes',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A little gift from Kadam Shoe Centre: 10% off any pair this month. Come by for a fitting.'],
    ],
    remarks: [
      'Size 9 UK, needs a wide fit',
      'Son Aarav wears size 4, grows fast',
      'Runs daily, buys running shoes twice a year',
      'Prefers black formals for office',
      'Daughter needs white PT shoes in June',
      'Asked to be told when size 11 is in',
    ],
    handle: 'kadamshoes',
  },
  gym: {
    dir: 'gym',
    template: 'gym',
    label: 'Gym & fitness',
    workspace: 'IronHouse Fitness',
    owner: ['Karan', 'Malhotra'],
    team: [
      ['Deepak Yadav', 'Trainer'],
      ['Simran Gill', 'Front desk'],
      ['Ajay Thakur', 'Trainer'],
    ],
    services: [
      ['Monthly plan', 1500, 30],
      ['Quarterly plan', 4000, 90],
      ['PT session', 600, 7],
      ['Day pass', 150, null],
      ['Diet plan', 1000, null],
    ],
    series: [
      {
        name: 'Monthly renewal reminder',
        description: "Reminds members 3 days before their monthly plan runs out, then a nudge if they haven't renewed.",
        service: 0,
        steps: [
          [27, 'Hi [[first_name]] 💪 Your monthly plan at [[business]] ends in 3 days. Shall I renew it so your streak doesn’t break?'],
          [5, 'Hi [[first_name]], we’ve missed you on the floor this week! Renew today and your trainer will plan a fresh routine to get you back on track.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a first PT session, thanks the member and asks for a review.',
        service: 2,
        steps: [
          [0.125, 'Great session today, [[first_name]]! 🔥 Thanks for training with [[business]]. Enjoying it? A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'Monthly renewal reminder',
        'Hi {first} 💪 Your monthly plan at IronHouse Fitness ends in 3 days. Shall I renew it and keep your 7 am slot with Deepak?',
      ],
      [
        'Thank you + Google review',
        'Great session today, {first}! 🔥 Thanks for training with IronHouse Fitness. A quick Google review helps us a lot: g.page/ironhousefit',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A gift from IronHouse Fitness: one free PT session this month. Just reply to pick a day.'],
    ],
    remarks: [
      'Trains at 7 am with Deepak',
      'Goal: lose 8 kg before March wedding',
      'Knee issue: no heavy squats',
      'Vegetarian, follows the diet plan',
      'Missed 2 weeks in Diwali, back now',
      'Asked about the quarterly plan',
    ],
    handle: 'ironhousefit',
  },
  'home-services': {
    dir: 'home-services',
    template: 'home',
    label: 'Home services & appliances',
    workspace: 'AquaBreeze Services',
    owner: ['Manoj', 'Verma'],
    team: [
      ['Salim Khan', 'AC technician'],
      ['Deepa Iyer', 'Customer care'],
      ['Ravi Kumar', 'RO technician'],
    ],
    services: [
      ['AC service', 600, 180],
      ['RO service', 500, 90],
      ['RO filter change', 1800, 365],
      ['AC gas refill', 2800, null],
      ['AC installation', 1500, null],
    ],
    series: [
      {
        name: 'AC service due in 6 months',
        description: 'Reminds customers when their AC is due for its next service, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            180,
            'Hi [[first_name]] ❄️ It’s been 6 months since your AC service with [[business]]. Get it cleaned before the heat sets in? Reply and we’ll fix a visit.',
          ],
          [7, 'Hi [[first_name]], a quick reminder that your AC service is due. Our technicians have slots this week. Reply here with a day that suits you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after an RO service, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [0.125, 'Thank you for choosing [[business]], [[first_name]]! 💧 Hope the water tastes fresh again. A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'AC service due in 6 months',
        'Hi {first} ❄️ Summer is coming, and it’s been 6 months since your AC service with AquaBreeze Services. Shall I send Salim for both bedroom units this week?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing AquaBreeze Services today, {first}! Hope the RO is working well. A quick Google review helps us a lot: g.page/aquabreeze',
      ],
      [
        'Birthday treat',
        'Happy birthday, {first}! 🎉 A small gift from AquaBreeze Services: 15% off your next AC or RO service this month. Just reply to book.',
      ],
    ],
    remarks: [
      '2 split ACs, Daikin, 1.5 ton',
      'Call before coming, 3rd floor, no lift',
      'RO filter last changed in March',
      'Prefers weekend visits after 11 am',
      'Bedroom AC making noise, check gas',
      'Asked about a yearly service plan',
    ],
    handle: 'aquabreeze',
  },
  'insurance-agent': {
    dir: 'insurance-agent',
    template: 'other',
    label: 'Any other business',
    workspace: 'Bharosa Insurance Services',
    owner: ['Rajesh', 'Gupta'],
    team: [
      ['Sunita Gupta', 'Renewals desk'],
      ['Imran Shaikh', 'Motor policies'],
      ['Deepak Nair', 'Health policies'],
    ],
    services: [
      ['Car insurance', 12000, 365],
      ['Health insurance', 24000, 365],
      ['Bike insurance', 1800, 365],
      ['New policy', 15000, null],
    ],
    series: [
      {
        name: 'Car policy renewal',
        description: "A month before the car policy's renewal date, reminds the client and asks for documents; a second reminder 20 days later.",
        service: 0,
        steps: [
          [
            335,
            'Namaste [[first_name]] 🚗 Your car insurance renewal is due next month. Please send a photo of your RC and I’ll get the renewal ready before the expiry date. – [[business]]',
          ],
          [20, 'Hi [[first_name]], a quick reminder: your car insurance expires in about 10 days. Reply here and we’ll finish the renewal in time 🙏'],
        ],
      },
      {
        name: 'Thank you + next renewal',
        description: "An hour after a new policy, thanks the client and says you'll remind them before next year's renewal.",
        service: 3,
        steps: [
          [
            0.04,
            'Thank you for trusting [[business]], [[first_name]]! 🙏 We’ll remind you a month before next year’s renewal. For any document help, just message here.',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Car policy renewal',
        'Namaste {first} 🚗 Your car insurance renewal is due next month. Please send a photo of your RC and I’ll get the renewal ready before the expiry date. – Bharosa Insurance Services',
      ],
      [
        'Thank you + next renewal',
        'Thank you for trusting Bharosa Insurance Services, {first}! 🙏 Your policy copy is on WhatsApp and email. We’ll remind you a month before next year’s renewal.',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Wishing you and your family good health and a safe year ahead. – Bharosa Insurance Services'],
    ],
    remarks: [
      'Car policy renews every March',
      'Two cars and one scooter in the family',
      'Prefers WhatsApp, not calls',
      'Wants policy PDF on email too',
      'Planning a new car this year',
      "Parents' health policy also with us",
    ],
    handle: 'bharosainsurance',
  },
  jewellery: {
    dir: 'jewellery',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Kanak Jewellers',
    owner: ['Rakesh', 'Soni'],
    team: [
      ['Pooja Soni', 'Sales'],
      ['Imran Qureshi', 'Karigar'],
      ['Anil Verma', 'Counter'],
    ],
    services: [
      ['Polish & clean', 300, 180],
      ['Gold jewellery', 45000, null],
      ['Diamonds', 65000, null],
      ['Silver items', 3500, null],
      ['Repair & resize', 500, null],
    ],
    series: [
      {
        name: 'Polish due in 6 months',
        description: 'Six months after a polish, reminds customers their jewellery is due again, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            180,
            'Hi [[first_name]] ✨ It’s been 6 months since your jewellery was last polished at [[business]]. Bring it in this week and we’ll make it shine like new.',
          ],
          [7, 'Hi [[first_name]], just a gentle reminder 😊 Polishing is done while you wait. Reply here with a day that suits you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a gold purchase, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for choosing [[business]], [[first_name]]! 💛 Wishing you many happy years with your new jewellery. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Polish due in 6 months',
        'Hi {first} ✨ It’s been 6 months since your bangles were polished at Kanak Jewellers. Dhanteras is coming, so bring them in this week and we’ll make them shine like new.',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Kanak Jewellers today, {first}! Wishing you many happy years with your new necklace. A quick Google review helps us a lot: g.page/kanakjewellers',
      ],
      [
        'Anniversary wishes',
        'Happy anniversary, {first}! 💛 Warm wishes from all of us at Kanak Jewellers. Drop by this month, we’d love to show you our new collection.',
      ],
    ],
    remarks: [
      'Ring size 14, prefers 22K gold',
      "Daughter's wedding in February",
      'Anniversary on 12 May',
      'Loves temple jewellery designs',
      'Buys a gold coin every Dhanteras',
      'Mangalsutra repair done by Imran',
    ],
    handle: 'kanakjewellers',
  },
  kirana: {
    dir: 'kirana',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Gupta Kirana Store',
    owner: ['Ramesh', 'Gupta'],
    team: [
      ['Sunita Gupta', 'Counter'],
      ['Raju Yadav', 'Helper'],
      ['Mohit Gupta', 'WhatsApp orders'],
    ],
    services: [
      ['Monthly ration', 4500, 30],
      ['Daily needs', 300, null],
      ['Dry fruits', 1200, null],
      ['Festive order', 3000, null],
      ['Atta & rice', 1500, null],
    ],
    series: [
      {
        name: 'Monthly ration reminder',
        description: 'A month after the ration, reminds the family to send their list, then a gentle nudge three days later.',
        service: 0,
        steps: [
          [
            30,
            'Hi [[first_name]] 🛒 It’s been a month since your ration from [[business]]. Running low on atta, dal or oil? Reply here with your list and we’ll get it ready.',
          ],
          [3, 'Hi [[first_name]], just checking 😊 Shall we get your usual monthly list ready? Reply here with anything to add or change.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a festive order, thanks the customer and asks for a review.',
        service: 3,
        steps: [
          [
            0.125,
            'Thank you for shopping with [[business]], [[first_name]]! 🙏 Hope everything was just right. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Monthly ration reminder',
        'Hi {first} 🛒 It’s been a month since your ration from Gupta Kirana Store. Shall we get your usual list ready: 10 kg atta, toor dal and mustard oil? Just reply with any changes.',
      ],
      [
        'Thank you + Google review',
        'Thank you for shopping with Gupta Kirana Store today, {first}! Hope the Diwali order was just right. A quick Google review helps us a lot: g.page/guptakirana',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 Warm wishes to you and your family from all of us at Gupta Kirana Store.'],
    ],
    remarks: [
      'Usual: 10 kg atta, 2 kg toor dal',
      'Buys ration in the first week',
      'Mustard oil only, not refined',
      'Sends the list on WhatsApp in Hindi',
      'Jain family: no onion, no garlic',
      'Asked for Diwali dry fruit boxes',
    ],
    handle: 'guptakirana',
  },
  laundry: {
    dir: 'laundry',
    template: 'home',
    label: 'Home services & appliances',
    workspace: 'Shubh Laundry',
    owner: ['Deepak', 'Kanojia'],
    team: [
      ['Lalita Devi', 'Ironing'],
      ['Sameer Ali', 'Pickup'],
      ['Nisha Kanojia', 'Front desk'],
    ],
    services: [
      ['Wash & iron', 400, 7],
      ['Dry cleaning', 900, null],
      ['Steam press', 200, null],
      ['Saree polish', 600, null],
      ['Curtains & sofa', 1500, 180],
    ],
    series: [
      {
        name: 'Weekly pickup reminder',
        description: 'A week after a wash & iron, asks if the customer wants a pickup, then a gentle nudge two days later.',
        service: 0,
        steps: [
          [
            7,
            'Hi [[first_name]] 👕 It’s been a week since your last laundry with [[business]]. Shall we pick up your clothes tomorrow? Just reply with a time that suits you.',
          ],
          [2, 'Hi [[first_name]], just a gentle reminder 😊 Reply here with a day and time, and we’ll come by for your clothes.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after dry cleaning, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for choosing [[business]], [[first_name]]! ✨ Hope your clothes came back just the way you like. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Weekly pickup reminder',
        'Hi {first} 👕 It’s been a week since your last laundry with Shubh Laundry. Shall Sameer pick up your clothes tomorrow at 9 am, same as usual?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Shubh Laundry today, {first}! Hope the silk saree came back just right. A quick Google review helps us a lot: g.page/shubhlaundry',
      ],
      [
        'Birthday treat',
        'Happy birthday, {first}! 🎉 A small gift from Shubh Laundry: 15% off your next dry-cleaning order this month. Just reply to fix a pickup.',
      ],
    ],
    remarks: [
      'Pickup Saturdays, 9 am, gate 2',
      'Light starch on cotton shirts',
      'Silk sarees: dry clean only',
      "Fold shirts, don't hang them",
      'Call before coming, 4th floor',
      'Wedding sherwani needed in March',
    ],
    handle: 'shubhlaundry',
  },
  'mobile-electronics': {
    dir: 'mobile-electronics',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Ankit Mobile & Electronics',
    owner: ['Ankit', 'Jain'],
    team: [
      ['Faizan Khan', 'Service technician'],
      ['Ritu Sharma', 'Sales'],
      ['Manoj Kumar', 'Accessories'],
    ],
    services: [
      ['Purchase', 15000, 30],
      ['Screen guard', 300, 90],
      ['Phone repair', 1500, null],
      ['Accessories', 800, null],
      ['Battery change', 1800, null],
    ],
    series: [
      {
        name: 'Phone check-in after 30 days',
        description:
          'A month after a phone purchase, checks the phone is working well and offers a screen guard, cover or quick check, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            30,
            'Hi [[first_name]] 📱 It’s been a month with your new phone from [[business]]. All working well? If the screen guard is scratched or you need a cover or charger, drop by and we’ll sort it.',
          ],
          [7, 'Hi [[first_name]], just checking in. If anything on the phone needs a look, bring it by this week and our technician will check it for you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a repair, thanks the customer and asks for a review.',
        service: 2,
        steps: [
          [
            0.125,
            'Thank you for choosing [[business]], [[first_name]]! 🔧 Hope your phone is working perfectly now. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Phone check-in after 30 days',
        'Hi {first} 📱 It’s been a month with your new phone from Ankit Mobile & Electronics. All working well? New covers for your model are in, shall I keep one aside?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Ankit Mobile & Electronics today, {first}! Hope your phone is working perfectly now. A quick Google review helps us a lot: g.page/ankitmobiles',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A little gift from Ankit Mobile & Electronics: 10% off any accessory this month. Just drop by.'],
    ],
    remarks: [
      'Bought a 5G phone in Sept, 128 GB',
      'Prefers tempered glass, not plastic guards',
      'Wants a smartwatch under ₹3,000',
      "Father's phone: set up big fonts",
      'Charging port replaced in August',
      'Plans to exchange old phone at Diwali',
    ],
    handle: 'ankitmobiles',
  },
  'music-academy': {
    dir: 'music-academy',
    template: 'coaching',
    label: 'Coaching & classes',
    workspace: 'Swarlay Music & Dance',
    owner: ['Meera', 'Deshpande'],
    team: [
      ["Rohan D'Souza", 'Keyboard & guitar'],
      ['Kavya Iyer', 'Bharatanatyam teacher'],
      ['Pooja Shinde', 'Front desk'],
    ],
    services: [
      ['Monthly fee', 2500, 30],
      ['Trial class', 300, 3],
      ['Quarterly fee', 7000, 90],
      ['Grade exam prep', 1500, null],
      ['Workshop', 800, null],
    ],
    series: [
      {
        name: 'Fee due for next month',
        description: "Reminds the parent when next month's fee is due, then a gentle follow-up a few days later.",
        service: 0,
        steps: [
          [
            28,
            'Namaste [[first_name]] 🎶 Next month’s fee at [[business]] is due this week. New pieces start next month, see you in class! Please ignore this if it’s already done.',
          ],
          [4, 'Hi [[first_name]], a gentle follow-up on this month’s fee at [[business]]. If you need a few more days, just reply here 🙏'],
        ],
      },
      {
        name: 'Trial class thanks + review',
        description: 'Three hours after a trial class, thanks them and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for coming to the trial class at [[business]], [[first_name]]! 🎵 Any questions about batches or timings, just reply. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Fee due for next month',
        'Namaste {first} 🎶 Riya’s fee for the Saturday keyboard batch at Swarlay Music & Dance is due this week. New exam pieces start next month, see you in class!',
      ],
      [
        'Trial class thanks + review',
        'Thank you for coming to the guitar trial class at Swarlay Music & Dance today, {first}! Any questions about timings, just reply here. A quick Google review helps us a lot: g.page/swarlay',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Keep singing, keep dancing. Lots of love from all your teachers at Swarlay Music & Dance.'],
    ],
    remarks: [
      'Grade 3 keyboard, passed with merit',
      'Saturday 10 am batch with Rohan',
      'Mother pays the fee, message her',
      'Solo dance item in the annual show',
      'Hindustani vocal, riyaaz is irregular',
      'Younger brother asked about tabla',
    ],
    handle: 'swarlay',
  },
  optical: {
    dir: 'optical',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Nayan Opticals',
    owner: ['Suresh', 'Menon'],
    team: [
      ['Divya Nair', 'Optometrist'],
      ['Karan Shah', 'Sales'],
      ['Asif Sheikh', 'Lens fitting'],
    ],
    services: [
      ['Eye check-up', 300, 365],
      ['Spectacles', 3500, null],
      ['Contact lenses', 1800, 90],
      ['Sunglasses', 2500, null],
      ['Frame repair', 200, null],
    ],
    series: [
      {
        name: 'Eye check-up due in 1 year',
        description: 'A year after an eye check-up, a courtesy reminder that the yearly check-up is due, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            365,
            'Hi [[first_name]] 👓 It’s been a year since your last eye check-up at [[business]]. Would you like to drop in for your yearly check-up this week?',
          ],
          [7, 'Hi [[first_name]], just a gentle reminder 😊 Reply here with a day and time that suits you, and we’ll keep a slot ready.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after new spectacles, thanks the customer and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for choosing [[business]], [[first_name]]! 👓 Hope your new glasses feel just right. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Eye check-up due in 1 year',
        'Hi {first} 👓 It’s been a year since your last eye check-up at Nayan Opticals. Would you like to drop in this Saturday? Divya has morning slots open.',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Nayan Opticals today, {first}! Hope your new frames feel just right. A quick Google review helps us a lot: g.page/nayanopticals',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A small gift from Nayan Opticals: 10% off any frame or sunglasses this month. Just drop by.'],
    ],
    remarks: [
      'Wears monthly contact lenses',
      'Prefers light titanium frames',
      'Son, 9, also wears glasses',
      'Works on a laptop all day',
      'Likes Saturday morning visits',
      'Asked about progressive lenses',
    ],
    handle: 'nayanopticals',
  },
  'pest-control': {
    dir: 'pest-control',
    template: 'home',
    label: 'Home services & appliances',
    workspace: 'Kavach Pest Services',
    owner: ['Sandeep', 'Kulkarni'],
    team: [
      ['Rafiq Shaikh', 'Senior technician'],
      ['Amol Jadhav', 'Technician'],
      ['Shweta Kulkarni', 'Bookings & follow-ups'],
    ],
    services: [
      ['Cockroach gel', 1200, 90],
      ['Anti-termite', 6000, 365],
      ['Bed bug', 2500, 14],
      ['Rodent control', 1500, null],
      ['Office AMC', 12000, 365],
    ],
    series: [
      {
        name: 'Cockroach gel due in 3 months',
        description:
          'Three months after a cockroach treatment, reminds the customer that the next round is due as per the technician, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            90,
            "Hi [[first_name]] 🏠 It's been 3 months since your cockroach treatment by [[business]]. As per the technician's schedule, your next round is due. Shall I book a visit?",
          ],
          [7, "Hi [[first_name]], a gentle reminder 😊 Your next cockroach treatment is due. Reply with a day that suits you and we'll send the technician."],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after an anti-termite job, thanks the customer and asks for a review.',
        service: 1,
        steps: [[0.125, 'Thank you for choosing [[business]], [[first_name]]! 🙏 Happy with the visit? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'Cockroach gel due in 3 months',
        "Hi {first} 🏠 It's been 3 months since your cockroach treatment by Kavach Pest Services. As per Rafiq's schedule, your next round is due. Shall I book Saturday morning?",
      ],
      [
        'Thank you + Google review',
        "Thank you for choosing Kavach Pest Services today, {first}! 🙏 Happy with Rafiq's visit? A quick Google review helps us a lot: g.page/kavachpest",
      ],
      [
        'Birthday wishes',
        'Happy birthday, {first}! 🎉 Warm wishes from all of us at Kavach Pest Services. A small gift: 10% off your next treatment this month.',
      ],
    ],
    remarks: [
      '2BHK, 4th floor: kitchen + 2 bathrooms',
      'Pet cat at home: tell technician before visit',
      'Termite in bedroom wardrobe: warranty card given',
      'Society needs a gate pass: call the guard',
      'Prefers Saturday morning visits',
      'Restaurant: monthly visit after closing time',
    ],
    handle: 'kavachpest',
  },
  'pet-care': {
    dir: 'pet-care',
    template: 'pet',
    label: 'Pet care & vet',
    workspace: 'Happy Tails Pet Care',
    owner: ['Ananya', 'Desai'],
    team: [
      ['Dr. Karan Malhotra', 'Vet'],
      ['Ritu Singh', 'Groomer'],
      ['Faizan Qureshi', 'Front desk'],
    ],
    services: [
      ['Grooming', 1200, 42],
      ['Vet consult', 600, null],
      ['Vaccination', 900, 365],
      ['Bath & nail trim', 500, 21],
      ['Tick treatment', 700, null],
    ],
    series: [
      {
        name: 'Grooming due in 6 weeks',
        description: "Reminds pet parents when their pet's next grooming is due, then a gentle nudge a week later.",
        service: 0,
        steps: [
          [42, 'Hi [[first_name]] 🐾 It’s been 6 weeks since your pet’s last grooming at [[business]]. Time for a fresh trim? Reply and we’ll book a slot.'],
          [7, 'Hi [[first_name]], we have a few grooming slots open this week. Reply here and we’ll keep one for your furry friend.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a vet consult, thanks the pet parent and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for visiting [[business]] today, [[first_name]]! 🐶 Wishing your pet a happy, healthy week. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Grooming due in 6 weeks',
        'Hi {first} 🐾 It’s been 6 weeks since Bruno’s last grooming at Happy Tails Pet Care. Shall I book him in with Ritu this Sunday morning?',
      ],
      [
        'Thank you + Google review',
        'Thank you for bringing Coco to Happy Tails Pet Care today, {first}! A quick Google review helps us a lot: g.page/happytails',
      ],
      [
        'Pet birthday wishes',
        'Happy birthday to Bruno, {first}! 🎂 A treat from Happy Tails Pet Care: 15% off his next grooming this month. Just reply to book.',
      ],
    ],
    remarks: [
      'Bruno, Golden Retriever, 4 years',
      'Gets anxious with dryers, towel dry',
      'Coco, Shih Tzu, prefers Ritu',
      'Annual vaccination due in March',
      'Allergic to chicken treats',
      'Asked about a monthly grooming plan',
    ],
    handle: 'happytails',
  },
  pharmacy: {
    dir: 'pharmacy',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Jeevan Medical Store',
    owner: ['Rakesh', 'Agarwal'],
    team: [
      ['Deepak Saini', 'Pharmacist'],
      ['Farhan Ali', 'Counter staff'],
      ['Anjali Rawat', 'Billing'],
    ],
    services: [
      ['Monthly refill', 1200, 30],
      ['Prescription', 450, null],
      ['Baby care', 700, null],
      ['Personal care', 300, null],
      ['Health devices', 1500, null],
    ],
    series: [
      {
        name: 'Monthly refill reminder',
        description: '25 days after a monthly refill, sends a courteous reminder, then a gentle nudge 3 days later.',
        service: 0,
        steps: [
          [
            25,
            'Namaste [[first_name]] 🙏 This is [[business]]. Your monthly medicines, as prescribed by your doctor, may be running low. Shall we keep them ready for you?',
          ],
          [3, 'Hi [[first_name]], a gentle reminder from [[business]] 😊 Reply here and we’ll keep your monthly medicines packed and ready.'],
        ],
      },
      {
        name: 'Thank you + next refill',
        description: 'An hour after a prescription purchase, thanks the customer and offers a reminder before the next refill.',
        service: 1,
        steps: [
          [
            0.04,
            'Thank you for visiting [[business]], [[first_name]] 🙏 If these are monthly medicines, reply here and we’ll remind you a few days before your next refill, as prescribed by your doctor.',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Monthly refill reminder',
        'Namaste {first} 🙏 This is Jeevan Medical Store. Your monthly medicines, as prescribed by your doctor, may be running low. Shall Deepak keep them packed and ready for this evening?',
      ],
      [
        'Thank you + next refill',
        'Thank you for visiting Jeevan Medical Store today, {first} 🙏 If these are monthly medicines, reply here and we’ll remind you a few days before your next refill, as prescribed by your doctor.',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Warm wishes from Rakesh and the whole team at Jeevan Medical Store. Have a wonderful day.'],
    ],
    remarks: [
      'Buys for both parents every month',
      'Son in Pune also on WhatsApp',
      'Prefers evening pickup after 7 pm',
      'Takes a 3-month pack',
      'Home delivery: Block C, 2nd floor',
      'Brings new prescription when renewed',
    ],
    handle: 'jeevanmedical',
  },
  'photo-studio': {
    dir: 'photo-studio',
    template: 'other',
    label: 'Any other business',
    workspace: 'Roshni Photo Studio',
    owner: ['Amit', 'Joshi'],
    team: [
      ['Farhan Ali', 'Photographer'],
      ['Neelam Rawat', 'Editor & albums'],
      ['Ritika Sen', 'Front desk'],
    ],
    services: [
      ['Baby milestone', 3500, 90],
      ['Family portrait', 3000, 365],
      ['Event coverage', 15000, null],
      ['Passport photos', 150, null],
      ['Photo album', 4000, null],
    ],
    series: [
      {
        name: 'Next baby milestone',
        description: 'Three months after a baby shoot, reminds the parents about the next milestone, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            90,
            'Hi [[first_name]] 📸 It’s been 3 months since your little one’s shoot at [[business]]. Babies change so fast! Shall we plan the next milestone photos?',
          ],
          [7, 'Hi [[first_name]], we have a few weekend slots for baby shoots 😊 Reply here and we’ll keep one for you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a family portrait, thanks the family and asks for a review.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for choosing [[business]], [[first_name]]! ✨ Your photos will be ready soon. Loved the shoot? A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Next baby milestone',
        'Hi {first} 📸 It’s been 3 months since Kiaan’s shoot at Roshni Photo Studio. Babies change so fast! Shall we plan his 6-month photos this weekend?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Roshni Photo Studio today, {first}! ✨ Your family photos will be ready by Friday. A quick Google review helps us a lot: g.page/roshnistudio',
      ],
      [
        'Anniversary wishes',
        'Happy anniversary in advance, {first}! 💐 Celebrate with a couple portrait at Roshni Photo Studio this week, we’ll keep a special backdrop ready.',
      ],
    ],
    remarks: [
      'Baby Kiaan, 3-month shoot done',
      'First birthday party in March',
      'Likes outdoor light, not flash',
      'Wants a 12x18 frame of the family',
      'Grandparents visit every December',
      'Came first for passport photos',
    ],
    handle: 'roshnistudio',
  },
  physiotherapy: {
    dir: 'physiotherapy',
    template: 'clinic',
    label: 'Clinic & dental',
    workspace: 'Aarambh Physio Clinic',
    owner: ['Nikhil', 'Joshi'],
    team: [
      ['Shruti Desai', 'Physiotherapist'],
      ['Aman Khan', 'Physiotherapist'],
      ['Rekha Pillai', 'Receptionist'],
    ],
    services: [
      ['Physio session', 600, 3],
      ['Assessment', 800, null],
      ['Review visit', 500, 30],
      ['Home visit', 1000, null],
      ['Posture check', 500, null],
    ],
    series: [
      {
        name: 'Next session reminder',
        description: "If a patient hasn't come in for 3 days, sends a polite reminder, then a gentle nudge a few days later.",
        service: 0,
        steps: [
          [
            3,
            'Namaste [[first_name]] 🙏 This is [[business]]. We missed you at your last session. Your physio has kept your plan ready; reply with a time that suits you.',
          ],
          [4, 'Hi [[first_name]], just a gentle reminder from [[business]]. Reply here whenever you’d like to book your next session.'],
        ],
      },
      {
        name: 'Thank you + next session',
        description: 'Three hours after the assessment, thanks the patient and mentions the next session.',
        service: 1,
        steps: [
          [
            0.125,
            'Thank you for visiting [[business]] today, [[first_name]] 🙏 We look forward to seeing you at your next session. Reply here if you need to change the time.',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Next session reminder',
        'Namaste {first} 🙏 This is Aarambh Physio Clinic. We missed you at your last session. Nikhil has kept your plan ready. Would tomorrow at 7 pm suit you?',
      ],
      [
        'Thank you + next session',
        'Thank you for visiting Aarambh Physio Clinic today, {first} 🙏 Your next session with Shruti is on Thursday at 7 pm. Reply here if you need to change it.',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Warm wishes from Nikhil and the whole team at Aarambh Physio Clinic. Have a wonderful day.'],
    ],
    remarks: [
      'Prefers 7 am, before office',
      'Prefers a female physio',
      'Speaks Marathi and Hindi',
      'Referred by Dr. Kulkarni',
      'Father brings him; ground floor only',
      'Home visits on Saturdays',
    ],
    handle: 'aarambhphysio',
  },
  restaurant: {
    dir: 'restaurant',
    template: 'restaurant',
    label: 'Restaurant & café',
    workspace: 'The Masala Courtyard',
    owner: ['Rahul', 'Iyer'],
    team: [
      ['Suresh Nair', 'Head chef'],
      ['Anjali Desai', 'Manager'],
      ['Imran Sheikh', 'Captain'],
    ],
    services: [
      ['Family dinner', 1400, 21],
      ['Sunday brunch', 650, 14],
      ['Weekday thali', 320, 7],
      ['Takeaway', 550, 10],
      ['Birthday party', 7500, null],
    ],
    series: [
      {
        name: 'Come back in 3 weeks',
        description: 'Invites families back three weeks after a dinner with a weekend treat, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            21,
            'Hi [[first_name]] 🍛 It’s been 3 weeks since your family dinner at [[business]]. Come this weekend and dessert is on us. Shall we keep a table?',
          ],
          [7, 'Hi [[first_name]], our weekend specials are on this Saturday and Sunday 😊 Reply here and we’ll keep a table for your family.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'An hour after Sunday brunch, thanks the guest and asks for a review.',
        service: 1,
        steps: [[0.04, 'Thank you for brunching with us at [[business]], [[first_name]]! 🙏 Enjoyed the food? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'Come back in 3 weeks',
        'Hi {first} 🍛 It’s been 3 weeks since your dinner at The Masala Courtyard. Dessert is on us this weekend. Shall I keep your usual window table?',
      ],
      [
        'Thank you + Google review',
        'Thank you for brunching with us today, {first}! 🙏 Loved the food at The Masala Courtyard? A quick Google review helps us a lot: g.page/masalacourtyard',
      ],
      [
        'Birthday & anniversary',
        'Happy birthday, {first}! 🎂 Celebrate with your family at The Masala Courtyard this week and the cake is on us. Just reply and we’ll keep a table.',
      ],
    ],
    remarks: [
      'Anniversary 14 Feb: likes the window table',
      'Jain food: no onion, no garlic',
      'Family of 5, needs a high chair',
      'Orders paneer tikka every visit',
      'Sunday lunch regular with parents',
      'Asked about a party for 30 guests',
    ],
    handle: 'masalacourtyard',
  },
  'retail-store': {
    dir: 'retail-store',
    template: 'retail',
    label: 'Retail store',
    workspace: 'Utsav Gifts & Decor',
    owner: ['Neelam', 'Arora'],
    team: [
      ['Kiran Desai', 'Sales'],
      ['Aman Gupta', 'Gift wrapping'],
      ['Shalini Pillai', 'Billing'],
    ],
    services: [
      ['Purchase', 1800, 60],
      ['Gift hamper', 2500, null],
      ['Home decor', 3500, null],
      ['Corporate gifts', 12000, null],
      ['Gift wrapping', 100, null],
    ],
    series: [
      {
        name: 'Next occasion after 60 days',
        description:
          'About two months after a purchase, reminds customers of you before their next birthday, anniversary or festival, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [
            60,
            'Hi [[first_name]] 🎁 Hope your last gift was loved! Any birthday, anniversary or festival coming up? New gifts and decor pieces have arrived at [[business]]. Shall I send you a few ideas?',
          ],
          [7, 'Hi [[first_name]], we can gift-wrap and keep it ready for you. Drop by this week, or reply here and I’ll put a few options aside.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a gift hamper, thanks the customer and asks for a review.',
        service: 1,
        steps: [[0.125, 'Thank you for choosing [[business]], [[first_name]]! 🎁 Hope they loved the hamper. A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'Next occasion after 60 days',
        'Hi {first} 🎁 Your anniversary is coming up next month, right? New couple gifts and brass decor have arrived at Utsav Gifts & Decor. Shall I send you a few ideas?',
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Utsav Gifts & Decor today, {first}! Hope they loved the hamper. A quick Google review helps us a lot: g.page/utsavgifts',
      ],
      [
        'Birthday treat',
        'Happy birthday, {first}! 🎉 A little gift from Utsav Gifts & Decor: 10% off anything in store this month, gift wrap on us. Come by soon.',
      ],
    ],
    remarks: [
      'Wedding anniversary on 14 Feb',
      'Orders Diwali hampers for office team',
      'Loves brass and handcrafted pieces',
      "Sister's housewarming in December",
      'Prefers kraft paper gift wrap',
      'Wants 20 hampers under ₹1,000 each',
    ],
    handle: 'utsavgifts',
  },
  saloon: {
    dir: 'saloon',
    template: 'salon',
    label: 'Salon & spa',
    workspace: 'Glow Studio',
    owner: ['Priya', 'Sharma'],
    team: [
      ['Arjun Mehta', 'Stylist'],
      ['Neha Kapoor', 'Front desk'],
      ['Vikram Rao', 'Stylist'],
    ],
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
          [28, 'Hi [[first_name]] ✂️ It’s been 4 weeks since your last haircut at [[business]]. Shall I book your usual slot?'],
          [7, 'Hi [[first_name]], we have a few slots open this weekend 😊 Reply here and I’ll book one for you.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a colour, thanks the client and asks for a review.',
        service: 1,
        steps: [[0.125, 'Thank you for visiting [[business]], [[first_name]]! ✨ Loved your new colour? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      ['Haircut due in 4 weeks', 'Hi {first} ✂️ It’s been 4 weeks since your last haircut at Glow Studio. Shall I book your usual Saturday slot with Arjun?'],
      [
        'Thank you + Google review',
        'Thank you for visiting Glow Studio today, {first}! ✨ Loved your new look? A quick Google review helps us a lot: g.page/glowstudio',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A treat from Glow Studio: 20% off any service this month. Just reply to book.'],
    ],
    remarks: [
      'Prefers Arjun for haircuts',
      'Global colour, shade 6.3 golden brown',
      'Sensitive skin: no fragrance products',
      'Wants a bridal trial in December',
      'Comes every month, Saturday mornings',
      'Asked about the hair spa membership',
    ],
    handle: 'glowstudio',
  },
  'spa-wellness': {
    dir: 'spa-wellness',
    template: 'salon',
    label: 'Salon & spa',
    workspace: 'Sukoon Day Spa',
    owner: ['Kavita', 'Malhotra'],
    team: [
      ['Meena Rai', 'Therapist'],
      ['Ravi Kumar', 'Therapist'],
      ['Simran Kaur', 'Front desk'],
    ],
    services: [
      ['Body massage', 1800, 28],
      ['Foot reflexology', 900, 14],
      ['Body polish', 2500, 42],
      ['Couple session', 3800, null],
      ['Head massage', 600, 14],
    ],
    series: [
      {
        name: 'Massage due in 4 weeks',
        description: 'Reminds guests when their usual massage is due, then a gentle nudge a week later.',
        service: 0,
        steps: [
          [28, 'Hi [[first_name]] 🌿 It’s been 4 weeks since your last massage at [[business]]. Shall I keep your usual slot with your therapist this week?'],
          [7, 'Hi [[first_name]], a gentle reminder from [[business]] 😊 Reply here with a day that suits you and we’ll book your session.'],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a body polish, thanks the guest and asks for a review.',
        service: 2,
        steps: [
          [0.125, 'Thank you for visiting [[business]], [[first_name]]! 🌸 Hope you enjoyed your session. A quick review helps us a lot: [[review_link]]'],
        ],
      },
    ],
    tasks: [
      [
        'Massage due in 4 weeks',
        'Hi {first} 🌿 It’s been 4 weeks since your last massage at Sukoon Day Spa. Shall I book your usual Sunday 11 am slot with Meena?',
      ],
      [
        'Thank you + Google review',
        'Thank you for visiting Sukoon Day Spa today, {first}! 🌸 Hope you enjoyed your session. A quick Google review helps us a lot: g.page/sukoonspa',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A treat from Sukoon Day Spa: 15% off any session this month. Just reply to book.'],
    ],
    remarks: [
      'Prefers a female therapist',
      'Medium pressure, Meena for massages',
      'Allergic to nut-based oils',
      'First visit on an anniversary voucher',
      'Comes every month, Sunday mornings',
      'Bought a gift voucher for her mother',
    ],
    handle: 'sukoonspa',
  },
  'sweet-shop': {
    dir: 'sweet-shop',
    template: 'restaurant',
    label: 'Restaurant & café',
    workspace: 'Kesar Mithai Ghar',
    owner: ['Ramesh', 'Agarwal'],
    team: [
      ['Sunita Agarwal', 'Counter & orders'],
      ['Mahesh Joshi', 'Head halwai'],
      ['Arif Khan', 'Bulk orders'],
    ],
    services: [
      ['Festive boxes', 30000, 300],
      ['Namkeen 1kg', 350, 15],
      ['Mithai box', 650, 30],
      ['Gift box', 900, 350],
      ['Wedding order', 45000, null],
    ],
    series: [
      {
        name: 'Festive boxes in 11 months',
        description: "Eleven months after an office's festive box order, offers this year's box options and rates, then a gentle nudge a week later.",
        service: 0,
        steps: [
          [
            300,
            "Namaste [[first_name]] 🎁 The festive season is coming! Last year your office's festive boxes came from [[business]]. Shall I send this year's box options and rates?",
          ],
          [7, "Hi [[first_name]], just checking 😊 Share the box count and date, and we'll keep your festive order ready on time."],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'An hour after a mithai box, thanks the customer and asks for a review.',
        service: 2,
        steps: [[0.04, 'Thank you for choosing [[business]], [[first_name]]! 😊 Enjoyed the sweets? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      [
        'Festive boxes in 11 months',
        "Namaste {first} 🎁 Last year your office took 60 kaju katli boxes from Kesar Mithai Ghar for the festive season. Shall I send this year's box options and rates before your list is final?",
      ],
      [
        'Thank you + Google review',
        'Thank you for choosing Kesar Mithai Ghar today, {first}! 😊 Enjoyed the sweets? A quick Google review helps us a lot: g.page/kesarmithai',
      ],
      [
        'Birthday treat',
        "Happy birthday, {first}! 🎉 Celebrate with Kesar Mithai Ghar: 10% off your birthday sweets this week. Just reply and we'll keep a box ready.",
      ],
    ],
    remarks: [
      'Office admin: 60 festive boxes every year',
      'Jain: no onion-garlic namkeen',
      'Less sweet, no silver vark',
      '1 kg aloo bhujia every fortnight',
      "Daughter's wedding in February: wants a quote",
      'Office contact changed: ask for Rahul now',
    ],
    handle: 'kesarmithai',
  },
  'tax-consultant': {
    dir: 'tax-consultant',
    template: 'other',
    label: 'Any other business',
    workspace: 'Mehta Tax & Accounts',
    owner: ['Nikhil', 'Mehta'],
    team: [
      ['Sameer Khan', 'GST accountant'],
      ['Pooja Jain', 'ITR & TDS'],
      ['Kiran Rao', 'Front office'],
    ],
    services: [
      ['GST return', 1500, 30],
      ['ITR filing', 2000, 365],
      ['TDS return', 2500, 90],
      ['GST registration', 3000, null],
      ['Bookkeeping', 4000, 30],
    ],
    series: [
      {
        name: 'GST bills reminder',
        description: "Asks the client for this month's bills well before the GST deadline, then a gentle nudge a few days later.",
        service: 0,
        steps: [
          [
            22,
            'Hi [[first_name]] 📑 Please share this month’s sales and purchase bills with [[business]], so your GST return is filed well before the deadline. Photos or Excel on WhatsApp are fine.',
          ],
          [3, 'Hi [[first_name]], a gentle reminder: we’re still waiting for this month’s bills. Send them here and we’ll take it from there 🙏'],
        ],
      },
      {
        name: 'ITR thank you + e-verify',
        description: 'An hour after an ITR filing, thanks the client and reminds them to e-verify the return.',
        service: 1,
        steps: [
          [
            0.04,
            'Thank you for trusting [[business]] with your ITR, [[first_name]]! 🙏 Your return is filed. Please remember to e-verify it; reply here if you need help. We’ll remind you again next season.',
          ],
        ],
      },
    ],
    tasks: [
      [
        'GST bills reminder',
        'Hi {first} 📑 Please share this month’s sales and purchase bills with Mehta Tax & Accounts, so your GST return is filed well before the deadline. Photos or Excel on WhatsApp are fine.',
      ],
      [
        'ITR thank you + e-verify',
        'Thank you for trusting Mehta Tax & Accounts with your ITR, {first}! 🙏 Your return is filed. Please remember to e-verify it; reply here if you need help. We’ll remind you again next season.',
      ],
      ['Birthday wishes', 'Happy birthday, {first}! 🎂 Wishing you a healthy and successful year ahead. – Mehta Tax & Accounts'],
    ],
    remarks: [
      'GST quarterly, sends bills late',
      'Salaried + rent from one flat',
      'Prefers Excel, not photos',
      "Father's ITR also filed by us",
      'Call only after 7 pm',
      'Wants a reminder before advance tax',
    ],
    handle: 'mehtatax',
  },
  'tiffin-service': {
    dir: 'tiffin-service',
    template: 'restaurant',
    label: 'Restaurant & café',
    workspace: 'Ghar Jaisa Tiffin',
    owner: ['Sunita', 'Deshmukh'],
    team: [
      ['Kavita More', 'Head cook'],
      ['Ganesh Pawar', 'Delivery'],
      ['Pooja Deshmukh', 'Orders & renewals'],
    ],
    services: [
      ['Monthly lunch', 3000, 30],
      ['Lunch + dinner', 5500, 30],
      ['Trial week', 800, 7],
      ['Sunday special', 200, 7],
      ['Party order', 4000, null],
    ],
    series: [
      {
        name: 'Plan renewal in 27 days',
        description: 'Three days before a monthly plan ends, asks the customer to continue, then a gentle nudge five days later.',
        service: 0,
        steps: [
          [
            27,
            "Hi [[first_name]] 🍱 Your monthly tiffin plan with [[business]] ends in 3 days. Shall we continue next month? Tell us if you'd like anything changed.",
          ],
          [5, "Hi [[first_name]], your tiffin plan has ended 😊 Back in town or want to restart? Reply here and we'll start from the next working day."],
        ],
      },
      {
        name: 'Thank you + Google review',
        description: 'Three hours after a party order, thanks the customer and asks for a review.',
        service: 4,
        steps: [
          [
            0.125,
            'Thank you for ordering from [[business]] for your function, [[first_name]]! 😊 Hope everyone enjoyed the food. A quick review helps us a lot: [[review_link]]',
          ],
        ],
      },
    ],
    tasks: [
      [
        'Plan renewal in 27 days',
        'Hi {first} 🍱 Your monthly lunch plan with Ghar Jaisa Tiffin ends on Saturday. Shall we continue from Monday? Same timing, and two rotis like you asked.',
      ],
      [
        'Thank you + Google review',
        'Thank you for ordering from Ghar Jaisa Tiffin for your function, {first}! 😊 Did the guests enjoy the food? A quick Google review helps us a lot: g.page/gharjaisatiffin',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 Your tiffin tomorrow comes with a little kheer from all of us at Ghar Jaisa Tiffin. Have a lovely day!'],
    ],
    remarks: [
      'Less oil, less chilli',
      'Jain: no onion, garlic or potato',
      'Only 2 rotis, no rice',
      'Office lunch by 1 pm, gate 2',
      'Going home for the festival: back on the 5th',
      'Dabba came back half-full twice: ask about spice',
    ],
    handle: 'gharjaisatiffin',
  },
  'yoga-dance': {
    dir: 'yoga-dance',
    template: 'gym',
    label: 'Gym & fitness',
    workspace: 'Tarang Yoga & Dance',
    owner: ['Ananya', 'Menon'],
    team: [
      ['Ritu Bhatia', 'Yoga teacher'],
      ['Siddharth Pillai', 'Dance teacher'],
      ['Kiran Patil', 'Front desk'],
    ],
    services: [
      ['Monthly batch', 2000, 30],
      ["Kids' dance", 1600, 30],
      ['Yoga drop-in', 300, null],
      ['Zumba batch', 1800, 30],
      ['Weekend workshop', 1200, null],
    ],
    series: [
      {
        name: 'Batch renewal in 30 days',
        description: 'Reminds students when their monthly batch is up for renewal, then a gentle nudge a few days later.',
        service: 0,
        steps: [
          [28, 'Hi [[first_name]] 🧘 Your monthly batch at [[business]] ends this week. Shall I keep your spot in the same batch for next month?'],
          [4, 'Hi [[first_name]], your mat is waiting! 😊 Reply here and I’ll renew your batch so you don’t miss a class.'],
        ],
      },
      {
        name: 'Workshop thanks + review',
        description: 'Three hours after a weekend workshop, thanks the student and asks for a review.',
        service: 4,
        steps: [[0.125, 'Thank you for joining the workshop at [[business]], [[first_name]]! ✨ Enjoyed it? A quick review helps us a lot: [[review_link]]']],
      },
    ],
    tasks: [
      ['Batch renewal in 30 days', 'Hi {first} 🧘 Your monthly batch at Tarang Yoga & Dance ends this week. Shall I keep your spot in Ritu’s 6:30 am batch?'],
      [
        'Workshop thanks + review',
        'Thank you for joining Sunday’s workshop at Tarang Yoga & Dance, {first}! ✨ A quick Google review helps us a lot: g.page/tarangstudio',
      ],
      ['Birthday treat', 'Happy birthday, {first}! 🎉 A gift from Tarang Yoga & Dance: bring a friend to any class this month, on us.'],
    ],
    remarks: [
      '6:30 am yoga batch with Ritu',
      'Back pain: avoids deep backbends',
      "Daughter Diya (9) in kids' Kathak",
      'Preparing for annual day performance',
      'Pays for 3 months at a time',
      'Asked about weekend Bollywood batch',
    ],
    handle: 'tarangstudio',
  },
};
