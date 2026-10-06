// Mirror of gas-monitor-web-v2/lib/legal.ts (commission inlined) - keep in sync, same LEGAL_VERSION.

/**
 * Terms & Conditions and Privacy Policy content.
 *
 * DRAFT — written from how the platform actually works (see CLAUDE.md), not
 * from legal advice. Have a Nigerian lawyer review both before relying on them.
 * Bump LEGAL_VERSION whenever the wording changes materially.
 */

export const LEGAL_VERSION = "2026-10-01";
export const LEGAL_EFFECTIVE_DATE = "1 October 2026";

export const COMPANY = {
  name: "4First Technologies Limited",
  product: "4FG Smart Gas Monitor",
  email: "4fg@4firsttechnologies.com",
  supportEmail: "4fg-support@4firsttechnologies.com",
} as const;

export type LegalBlock = string | { list: string[] };

export type LegalSection = {
  id: string;
  heading: string;
  body: LegalBlock[];
};

export type LegalDoc = {
  slug: "terms" | "privacy";
  title: string;
  /** One-line plain-language summary shown above the document. */
  summary: string;
  sections: LegalSection[];
};

const { name: CO, product: PRODUCT, email: EMAIL } = COMPANY;

export const TERMS: LegalDoc = {
  slug: "terms",
  title: "Terms and Conditions",
  summary:
    "The rules for using the 4FG platform — the monitor, the apps, the marketplace and deliveries.",
  sections: [
    {
      id: "about",
      heading: "About these terms",
      body: [
        `These Terms and Conditions ("Terms") govern your access to and use of the ${PRODUCT} platform, which is operated by ${CO} ("4FG", "we", "us"). The platform includes the 4FG gas monitoring device, our mobile apps and websites, the vendor marketplace, and the delivery services connected to it (together, the "Platform").`,
        "By creating an account, or by using the Platform, you agree to these Terms and to our Privacy Policy. If you do not agree, do not create an account or use the Platform.",
        "You must be at least 18 years old and able to enter a binding contract under Nigerian law to use the Platform.",
      ],
    },
    {
      id: "accounts",
      heading: "Accounts and roles",
      body: [
        "The Platform has three kinds of account. A consumer account is for people who monitor their own gas and order refills. A vendor account is for gas businesses that list products and fulfil orders. A rider account is for delivery agents who carry out deliveries assigned to them.",
        "You agree to give accurate information when you register, to keep it up to date, and to keep your password confidential. You are responsible for everything done through your account. Tell us promptly at the support address below if you think someone else has accessed it.",
        "You must verify your email address with the one-time code we send before your account becomes active.",
      ],
    },
    {
      id: "approval",
      heading: "Vendor and rider approval",
      body: [
        "Vendor and rider accounts are reviewed by 4FG before they are activated. We may ask for identity documents, business licences, safety records or vehicle details as part of that review.",
        "We may approve, reject or later suspend a vendor or rider account at our discretion, including where documents are missing or false, where safety standards are not met, or where these Terms are broken. Approval is not an endorsement or a guarantee of the quality of any vendor's or rider's service.",
      ],
    },
    {
      id: "monitor",
      heading: "The monitoring device",
      body: [
        "The 4FG device measures the weight of a gas cylinder and can report related readings such as temperature and pressure. It can send alerts to the phone number you configure and, where you enable it, trigger reminders to reorder.",
        "The device and its readings are an aid only. They are not a substitute for a gas leak detector, a fire or safety system, regular cylinder and regulator inspection, or the instructions of your gas supplier and the emergency services. Readings may be delayed, interrupted or inaccurate, for example when mobile or network coverage fails. If you smell gas or suspect a leak, act on that — do not wait for an alert.",
        "You must install and use the device in line with the instructions we provide.",
      ],
    },
    {
      id: "marketplace",
      heading: "Marketplace, orders and deliveries",
      body: [
        "The marketplace lets consumers order gas from approved vendors. 4FG provides the technology that connects the parties and processes payment. The sale of gas is a contract between the consumer and the vendor; 4FG is not the seller of vendor products and is not responsible for their quality, quantity, safety or legality, except as the law requires.",
        "Prices, cylinder sizes and availability are set by vendors. When you place an order you authorise us to collect payment on the vendor's behalf. An order is confirmed once payment succeeds.",
        "A vendor may assign a confirmed order to an approved rider, or deliver it themselves. Riders update an order as it moves from confirmed to out for delivery to delivered. Delivery times shown are estimates.",
        "Orders marked as delivered are treated as complete. If something is wrong with an order, contact the vendor first and then our support team within a reasonable time so we can help resolve it.",
      ],
    },
    {
      id: "vendors",
      heading: "Vendor terms",
      body: [
        `There is no fee for being listed on the marketplace. 4FG charges a platform commission of 7% of the value of each completed order, as described on our partner plan page. We may change the commission with reasonable notice, and a change will not affect orders already placed.`,
        "As a vendor you confirm that you hold every licence and permit needed to sell and transport gas in the places you serve, that your listings are accurate, and that cylinders and equipment you supply are safe, correctly filled and compliant with applicable standards. You are responsible for your own tax obligations.",
        "You must fulfil confirmed orders promptly and must not cancel confirmed orders without good reason.",
      ],
    },
    {
      id: "riders",
      heading: "Rider terms",
      body: [
        "Riders are independent. Being approved on the Platform does not make you an employee, partner or agent of 4FG or of any vendor, and nothing in these Terms creates an employment relationship.",
        "As a rider you confirm that you may lawfully operate the vehicle you registered, that you will handle and transport gas cylinders safely, obey traffic and safety laws, and only mark an order as delivered once the customer has received it. You must keep your phone number and vehicle details up to date.",
      ],
    },
    {
      id: "payments",
      heading: "Payments",
      body: [
        "Payments are processed by our payment partner, Paystack. We do not store your full card details. You agree to Paystack's terms when you pay.",
        "You are responsible for any charges your bank or mobile network applies. If a payment is reversed or disputed, we may suspend the related order or account while it is investigated. Refunds, where due, are returned to the original payment method.",
      ],
    },
    {
      id: "conduct",
      heading: "Acceptable use",
      body: [
        "You agree not to misuse the Platform. In particular, you must not:",
        {
          list: [
            "provide false or misleading information, or impersonate another person or business;",
            "interfere with, probe or attempt to break the security of the Platform or the monitoring device;",
            "use the Platform for anything unlawful, or to sell gas or equipment that is unsafe or unlawful;",
            "scrape, copy or resell Platform data, or reverse-engineer our software or device firmware;",
            "harass, threaten or abuse other users, vendors, riders or our staff.",
          ],
        },
      ],
    },
    {
      id: "ip",
      heading: "Our intellectual property",
      body: [
        "The Platform, including the software, the device, the 4FG name and logo, and all content we provide, belongs to 4FG or its licensors. We give you a limited, personal, non-transferable right to use the Platform in line with these Terms. You keep ownership of the content you submit, and you give us the right to use it as needed to run the Platform.",
      ],
    },
    {
      id: "liability",
      heading: "Our responsibility",
      body: [
        "We work to keep the Platform available and accurate, but it is provided on an \"as is\" and \"as available\" basis, and we cannot promise it will be uninterrupted or error-free.",
        "To the fullest extent the law allows, 4FG is not liable for indirect or consequential loss, for loss of profit or data, or for loss arising from the acts or omissions of vendors, riders or other users, or from network failures outside our control. Nothing in these Terms limits liability that cannot lawfully be limited, including for death or personal injury caused by our negligence.",
        "Where we are liable to you, our total liability for any claim is limited to the amount you paid us (or, for vendors, the commission we received) in respect of the order or service the claim relates to.",
      ],
    },
    {
      id: "suspension",
      heading: "Suspension and ending your account",
      body: [
        "You can stop using the Platform and ask us to close your account at any time. We may suspend or close an account, with or without notice, if you break these Terms, if we must do so by law, or if we reasonably believe the account puts others at risk.",
        "Ending an account does not affect orders already placed or any amounts already owed.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      body: [
        "We may update these Terms from time to time. If a change is material we will tell you through the Platform or by email and, where the law requires, ask you to accept the new Terms again. Using the Platform after a change takes effect means you accept it.",
      ],
    },
    {
      id: "law",
      heading: "Governing law and contact",
      body: [
        "These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have jurisdiction over any dispute, unless the law gives you the right to bring a claim elsewhere. We encourage you to contact us first so we can try to resolve a problem informally.",
        `Questions about these Terms: ${EMAIL}. For help with your account or an order: ${COMPANY.supportEmail}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "What personal data we collect, why we use it, who we share it with, and the choices you have.",
  sections: [
    {
      id: "who",
      heading: "Who we are",
      body: [
        `${CO} ("4FG", "we", "us") runs the ${PRODUCT} platform and is the controller of the personal data described in this policy. We handle personal data in line with the Nigeria Data Protection Act 2023 and other applicable Nigerian law.`,
        `You can reach us about privacy at ${EMAIL}.`,
      ],
    },
    {
      id: "collect",
      heading: "What we collect",
      body: [
        "What we collect depends on how you use the Platform:",
        {
          list: [
            "Account details — your name, email address, phone number, password (stored only in hashed form) and the role you registered for.",
            "Delivery details — saved delivery addresses and the details of the orders you place or fulfil.",
            "Device data — the readings from your 4FG device, such as cylinder weight, temperature and pressure, the phone number and location label you configure, and your alert thresholds.",
            "Vendor information — business name, address, state and city, phone number, business description and logo, and the identity or licence documents you upload for review.",
            "Rider information — phone number, vehicle type and plate number, and the status of your application.",
            "Payment information — order references and payment status from Paystack. We do not receive or store your full card number.",
            "Technical data — information about your device and app, error reports, and the sign-in tokens kept in your browser or app so you stay signed in.",
            "Messages — what you send our support team or through the contact form.",
          ],
        },
      ],
    },
    {
      id: "use",
      heading: "How we use your data",
      body: [
        "We use personal data to:",
        {
          list: [
            "create and secure your account, and verify your email address;",
            "provide the monitoring service, send you alerts and reorder reminders;",
            "process orders and payments, and connect consumers, vendors and riders so an order can be delivered;",
            "review vendor and rider applications and keep the marketplace safe;",
            "send service messages by email or SMS, such as verification codes and order updates;",
            "provide support, prevent fraud and misuse, and fix problems;",
            "improve the Platform and meet our legal obligations.",
          ],
        },
        "Where the law requires a legal basis, we rely on performing our contract with you, our legitimate interests in running and securing the Platform, compliance with legal obligations, and your consent where we ask for it.",
      ],
    },
    {
      id: "sharing",
      heading: "Who we share it with",
      body: [
        "We do not sell your personal data. We share it only as needed to run the Platform:",
        {
          list: [
            "Vendors and riders — when you place an order, the vendor sees your name, delivery address and order details, and an assigned rider sees your name, phone number and delivery address so they can reach you and deliver. Consumers can see the assigned rider's name and phone number.",
            "Service providers who act on our behalf — Paystack (payments), Resend and our SMS provider (email and text messages), Supabase (database hosting), Render and Netlify (application hosting) and Sentry (error monitoring).",
            "Authorities and advisers — where the law requires, to protect rights and safety, or to our professional advisers under a duty of confidentiality.",
            "A successor — if our business is sold or reorganised, in which case this policy continues to apply to your data.",
          ],
        },
        "Some of these providers process data outside Nigeria. Where that happens, we take steps to make sure your data stays protected as the law requires.",
      ],
    },
    {
      id: "storage",
      heading: "How long we keep it",
      body: [
        "We keep personal data only as long as we need it for the purposes above. Account data is kept while your account is open. Order and payment records are kept for as long as tax, accounting and dispute-resolution rules require. Identity and licence documents are kept while a vendor account is active and for a reasonable period afterwards. When data is no longer needed we delete or anonymise it.",
      ],
    },
    {
      id: "security",
      heading: "Keeping it safe",
      body: [
        "We use measures such as encrypted connections, hashed passwords, access controls and an audit trail of administrator actions to protect your data. No system is completely secure, so please choose a strong password and keep it private. If a breach affecting your data occurs, we will notify you and the regulator as the law requires.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      body: [
        "Under Nigerian data protection law you may have the right to:",
        {
          list: [
            "access the personal data we hold about you and receive a copy;",
            "correct data that is wrong or incomplete — most of it you can edit yourself in your profile;",
            "ask us to delete your data, or restrict or object to how we use it;",
            "withdraw consent you have given, without affecting what happened before;",
            "move your data to another service where this applies;",
            "complain to the Nigeria Data Protection Commission.",
          ],
        },
        `To use any of these rights, contact us at ${EMAIL}. We may need to confirm who you are first, and some data we must keep to meet legal duties.`,
      ],
    },
    {
      id: "cookies",
      heading: "Cookies and similar storage",
      body: [
        "We use your browser's local storage and your device's secure storage to keep you signed in and remember preferences such as light or dark mode. We use error-monitoring tools to find and fix faults. You can clear this storage in your browser at any time, but you will be signed out.",
      ],
    },
    {
      id: "children",
      heading: "Children",
      body: [
        "The Platform is for adults. We do not knowingly collect personal data from anyone under 18. If you believe a child has given us personal data, please contact us and we will delete it.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      body: [
        "We may update this policy as the Platform or the law changes. We will tell you about important changes through the Platform or by email, and the date at the top shows when it was last updated.",
      ],
    },
    {
      id: "contact",
      heading: "Contact us",
      body: [
        `${CO}. Privacy questions and requests: ${EMAIL}. Account and order support: ${COMPANY.supportEmail}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY } as const;
