# 4FG Monitor Mobile App: Tester Guide

**App version under test:** 1.0.3 (confirm on your build: Settings / Profile screen, or ask your coordinator)
**Platform:** Android (package `com.fourfirsttechnologies.gasmonitor`)
**Test coordinator:** Okonkwo Ugochukwu, cto@4firsttechnologies.com, +234 803 767 4195
**Bug tracker:** https://4fgmonitor.com/testers (invite-only: sign in with the email you were invited with)
**Test window:** `<start date>` to `<end date>`

> Items in `<angle brackets>` are filled in by the coordinator before this guide is shared.

---

## 1. What you are testing

4FG Monitor is a gas app with four kinds of user. Each one sees a different app after signing in:

| Role | What they do in the app |
|---|---|
| **Consumer** | Browses gas suppliers, orders gas (by cylinder size, weight or amount), pays online, tracks the order, monitors a gas device |
| **Vendor** | Lists gas products, receives and manages orders, assigns riders, manages branches and staff, sees earnings |
| **Rider** | Gets assigned deliveries, marks them out for delivery and delivered, sees earnings |
| **Logistics Company** | Owns a fleet of riders, invites riders, watches deliveries |
| **Branch Manager** | Invited by a vendor (via email link on the website); handles orders and stock for their branch |

Your goal is to **find problems before real customers do**: things that crash, confuse, look wrong, or give a wrong result.

## 2. Before you start

### 2.1 Install the build
1. Open https://play.google.com/store/apps/details?id=com.fourfirsttechnologies.gasmonitor on your Android phone.
2. If installing an APK, allow "Install unknown apps" for your browser when asked.
3. Open the app. You should see the animated splash, then onboarding.

### 2.2 What you need
- An Android phone (note the model and Android version: we need them in every report)
- A working **email address you can open on the phone**: sign-up sends a 6-digit code
- A stable internet connection (and ideally one weak or mobile-data connection for the connectivity tests)
- Screen recording enabled (Android: swipe down, "Screen recorder"). Short recordings make bugs much easier to fix.

### 2.3 Test environment and payments (**read this**)
The app is connected to: `<TEST / STAGING / LIVE: coordinator to confirm>`.

- **Never use a real bank card or real money unless the coordinator explicitly says the environment is live and gives you a budget.**
- Test payments: use the test card details supplied by the coordinator: `<Paystack test card / Payfonte sandbox / MyIMO details>`.
- If a payment screen asks for a real card and you were not told to use one, **stop and report it**.
- Some payment providers on staging can move real money. Use only the smallest amounts the coordinator gives you.

### 2.4 Test accounts
Create your own accounts using the sign-up screens (that is part of the test). Use a naming convention so we can find your data:

- Email: `yourname+consumer@gmail.com`, `yourname+vendor@gmail.com`, `yourname+rider@gmail.com` (Gmail ignores the `+tag`, so all mail arrives in one inbox)
- Name: prefix with `TEST`, e.g. `TEST Ada Consumer`

Vendors, riders and companies need **admin approval** before they appear in the marketplace. Tell the coordinator your account email when you have signed up and they will approve it. Pre-approved accounts: 0.

## 3. How to test

1. Work through the **test cases in Section 5** for the role(s) assigned to you.
2. For each case, mark **Pass**, **Fail** or **Blocked** (could not do it) in the tracking sheet: `<link>`.
3. While doing the cases, also **explore freely** for 10–15 minutes per role. Tap everything, go back, rotate the phone, switch apps. Many real bugs are found this way.
4. Report every Fail (and anything that merely feels wrong) using Section 7.

**What "wrong" looks like:** a crash or frozen screen, a blank screen or endless spinner, a button that does nothing, wrong amounts or statuses, text cut off or overlapping, a confusing message, an error showing technical text, something that works on the website but not in the app (or the other way round).

## 4. Everyone: general checks

Run these once, regardless of role.

| # | Check | Expected |
|---|---|---|
| G1 | Install and first open | Splash plays, then onboarding (3 slides). No crash. |
| G2 | Onboarding slide 3 | Role options shown (Consumer / Vendor / Rider) plus a Log In link; each goes to the right sign-up screen |
| G3 | Close the app fully and reopen while signed in | Goes straight to your role's home screen, not back to onboarding |
| G4 | Sign out, then sign in again | Works; lands on the right home screen |
| G5 | Kill the app mid-screen, reopen | No crash, no lost account |
| G6 | Turn on airplane mode, then use the app | Clear, friendly error or offline message; no crash; recovers when you reconnect |
| G7 | Rotate the phone / change font size (Settings > Display) | Nothing unreadable or cut off |
| G8 | Dark mode on/off | Screens remain readable |
| G9 | Press the Android back button on every screen | Goes back sensibly; never exits unexpectedly or loops |
| G10 | Send the app to the background for 5+ minutes, return | Still signed in, data refreshes |
| G11 | Update prompt | If you are told a newer version exists, an update prompt appears. Below the minimum version it blocks the app until updated. |
| G12 | Legal pages (Terms / Privacy) | Open and are readable |
| G13 | Notifications screen | Opens; shows messages sent to you; no crash when empty |

## 5. Role-based test cases

### 5.1 Account creation and sign-in (all roles)

| # | Steps | Expected |
|---|---|---|
| A1 | Sign up with a valid name, email, password | Moves to a **verify email** screen; a 6-digit code arrives by email |
| A2 | Enter the correct code | Account verified, you are signed in and land on the right screen |
| A3 | Enter a wrong code | Clear error; you can retry |
| A4 | Enter wrong code 5+ times | Locked out with a message; requesting a new code works |
| A5 | Tap **Resend code** | A new code arrives; the old one no longer works |
| A6 | Let a code sit for over 10 minutes, then use it | Rejected as expired |
| A7 | Sign up with an email that already exists | Clear message, no crash |
| A8 | Sign up with a weak/short password, invalid email, empty fields | Helpful inline errors |
| A9 | Sign in with a wrong password | Clear error |
| A10 | Sign in with an account you never verified | Sent to the verify screen, not a vague error |
| A11 | **Forgot password**: email, then code + new password, then done | Password changes; old password no longer works; new one does |
| A12 | Show/hide password toggle | Works |

### 5.2 Consumer

| # | Steps | Expected |
|---|---|---|
| C1 | Sign up as Consumer and land on the home dashboard | Gauge, stats and actions display. (The device ID and **Simulate Drain** are demo features, so do not report those as bugs.) |
| C2 | Open the order section (Order Refill) | Three tabs: **Suppliers**, **Order History**, **My Addresses** |
| C3 | Browse suppliers | Only approved vendors with stock appear. Cards show the price **per kg** (₦X / kg) |
| C4 | Filter by gas type; check distance ordering | Filtering and sorting behave correctly |
| C5 | **My Addresses**: add, edit, delete an address | Saves and persists after closing the app |
| C6 | Choose a supplier, pick a cylinder size and quantity | Price = price per kg × size × quantity, plus delivery fee. Summary matches |
| C7 | Order **by weight** (loose gas) on a supplier that allows it | Amount shown matches price/kg × kg + delivery fee; limits 0.5–100 kg |
| C8 | Order **by amount** (loose gas) | You pay exactly the amount you entered for gas (+ delivery); the kg shown is calculated correctly |
| C9 | Try loose gas on a supplier that does not offer it | Option not offered, or refused clearly |
| C10 | Place an order and pay using the **test** details | Payment page opens in the app, then a success screen with supplier, amount and reference |
| C11 | If a "Pay with" option appears (more than one payment provider), try each one | Each works, or fails with a clear message |
| C12 | Start payment, then back out / close the payment page | Order stays unpaid; no crash; you can try again or find the order |
| C13 | **Pay and immediately close the app** | When you reopen, the order shows as confirmed (it may take a few minutes) |
| C14 | Order History | New order is listed, newest first; pull to refresh works |
| C15 | Open an order | Status banner, timeline, items, address, payment, and (once assigned) the rider name and phone |
| C16 | Watch an order progress as the vendor/rider updates it (coordinate with a vendor/rider tester) | Status changes show after refresh: Confirmed, Out for delivery, Delivered |
| C17 | Settings: edit profile, notification preferences, units | Changes persist |
| C18 | Spending analytics (from Settings) | Charts and totals match your orders (empty state if none) |
| C19 | Notifications | Messages/broadcasts appear; unread indicator clears |
| C20 | **Delete account** (use a throwaway account only) | Needs password; refused with an explanation if you have an open order; otherwise signs you out and you can never sign in again |

### 5.3 Vendor

| # | Steps | Expected |
|---|---|---|
| V1 | Sign up as Vendor (3 steps: account, business, CAC RC number) | Step progress works; RC number accepted in formats like `RC1234567` or `1234567`; a duplicate RC number is refused |
| V2 | Finish verification | You land in the vendor app with a **"not visible yet / pending approval"** banner |
| V3 | While pending, create a listing | Allowed (but hidden from customers until approved) |
| V4 | After the coordinator approves you, pull to refresh or reopen | Banner disappears; listing becomes visible to consumers |
| V5 | Listings: create, edit, mark out of stock, delete | Each works and persists; sizes and price per kg show correctly |
| V6 | Turn **loose gas** on for a listing | Consumers can then order by weight/amount |
| V7 | Add a logo and a listing photo (JPG/PNG/WebP, under 5 MB) | Uploads; image shows in the app and to consumers; a wrong type or oversized file is refused with a clear message |
| V8 | Incoming orders: receive a paid test order | Appears under Incoming Orders with correct items, total and address |
| V9 | Move an order through statuses | Confirmed, Out for delivery, Delivered. Statuses update for the consumer too |
| V10 | **Assign rider** on a confirmed order, then Change and Unassign | List shows approved riders only; assignment shows on the order |
| V11 | Branches: add, edit, make main, close, reopen | Cannot close the main branch or a branch with open orders; plan limit enforced with a clear message |
| V12 | Invite a branch manager by email | Invite is sent (or you are told it was not); manager can be removed |
| V13 | Earnings | Delivered orders show gas price, commission and status; totals are plausible |
| V14 | Analytics | Charts match your orders |
| V15 | Plan card: change plan | Changes are reflected; limits update |
| V16 | Payout account (profile): add a bank and account number | Account **name appears automatically** from the bank; changing requires your password; only last 4 digits are shown afterwards |
| V17 | Edit profile, sign out, sign in | All persists |
| V18 | Delete account (throwaway only) | Refused with an explanation if you have paid undelivered orders or unpaid earnings |

### 5.4 Rider (Single Rider)

| # | Steps | Expected |
|---|---|---|
| R1 | Sign up as Rider (account, then phone/vehicle) | Works; verify email; lands on the rider app with an **approval banner** while pending |
| R2 | Before approval: look at Deliveries | Empty list; you cannot update deliveries |
| R3 | After approval: have a vendor assign you an order | Order appears in Deliveries (refreshes about every 30 seconds, or pull to refresh) |
| R4 | Open the delivery | Pickup (vendor) and drop-off (customer) addresses, tap-to-call and open-in-Maps work; shows "no cash to collect" |
| R5 | **Start Delivery**, then **Mark as Delivered** | Confirmation prompt each time; order moves to History |
| R6 | Try to tap the same action twice quickly | No duplicate or skipped status |
| R7 | History | Delivered and cancelled orders, newest first |
| R8 | Earnings | Delivered orders earn a share of the delivery fee; prompt to add a bank account if none |
| R9 | Profile: edit phone, vehicle, plate; add a payout account | Saves; bank name resolves automatically |
| R10 | A rider rejected or in a company that is not approved | Cannot take deliveries; clear message |

### 5.5 Logistics Company

| # | Steps | Expected |
|---|---|---|
| L1 | Sign up: **Rider** tab, then **Logistics Company** sub-tab | Company details form works; verify email |
| L2 | Before admin approval | Can see the app and banner; cannot invite or remove riders |
| L3 | After approval: invite a rider by email | Invite recorded; the rider (once signed up and verified with that email) joins the fleet |
| L4 | Riders list shows fleet members and status | Correct; remove a rider works |
| L5 | Deliveries | Shows rider, vendor name and delivery address, and **no customer email or phone** |
| L6 | Account screen | Details are correct |
| L7 | Sign in on the **Rider** tab | Company signs in there |

### 5.6 Branch Manager

| # | Steps | Expected |
|---|---|---|
| M1 | Vendor invites you; open the emailed link in a browser; set name and password | Account is created. (Managers do **not** use the public sign-up.) |
| M2 | Sign in on the **Vendor** tab in the app | Lands on the manager app |
| M3 | Orders for your branch only | You do not see other branches' orders |
| M4 | Move a confirmed order forward; assign a rider | Works. You cannot move an unpaid order |
| M5 | Stock: toggle a listing in or out of stock | Reflects for consumers |
| M6 | You see no earnings, documents, plan or branch management; customer email hidden | Correct |

## 6. Special areas worth extra attention

- **Payments:** the most important flow. Try success, cancelled, abandoned, and "paid then closed the app". Check the amount charged equals the order total shown.
- **Approval states:** pending, approved and rejected accounts behave differently. Test the banner and what each state is allowed to do.
- **Two-phone tests:** the best bugs show up between roles (consumer orders, vendor confirms, vendor assigns rider, rider delivers, consumer sees Delivered). Pair up with another tester.
- **Slow or lost connection** during sign-up, payment and status changes.
- **Numbers:** compare every price, quantity and total against your own calculation.
- **Permissions:** location, notifications, photos. Check the permission request makes sense, and that **denying it** does not break the app.
- **Push notifications:** only appear if the build supports them. Report if you get none when a broadcast or order update is expected, but note it as "check".

## 7. How to report a bug

### 7.1 Signing in to the bug tracker

1. Open **`https://4fgmonitor.com/testers`** (on your phone or a computer).
2. Enter the email address you were invited with. Check that inbox for a **6-digit code** (valid for 10 minutes) and enter it. There is no password.
3. If no code arrives, check spam, then ask the coordinator to confirm your address was added.

Tap **Report a bug**, fill in the form, attach screenshots or a screen recording (up to 6 files, 50 MB each), and send. You can add more detail later under **My reports**.

### 7.2 After you report

- **My reports** shows every report you filed and its status: *Received*, *Being fixed*, *We need more info*, *Fixed: please retest*, *Verified*.
- If we ask a question, you get an email. Answer it on the report page and it goes back to the team.
- When a fix is ready you get an email naming the build. Update the app, repeat your steps, then tap **It's fixed** or **Still happens** on the report.

### 7.3 What to put in each report

Report each problem separately, with:

1. **Title:** one line, e.g. "Vendor: Assign rider sheet shows no riders"
2. **Role and screen:** e.g. Vendor / Incoming Orders
3. **Steps to reproduce:** numbered, starting from a known place
4. **What you expected**
5. **What actually happened**
6. **How often:** every time / sometimes / once
7. **Evidence:** screenshot or screen recording (the recording is most useful)
8. **Environment:** phone model, Android version, app version, Wi-Fi or mobile data, time it happened
9. **Account email used** (never send your password)
10. **Severity:**
    - **Critical:** crash, cannot sign in, wrong money amount, payment problem, data loss
    - **High:** a main feature does not work, no workaround
    - **Medium:** feature works badly or confusingly, has a workaround
    - **Low:** cosmetic, typo, minor polish

**Example**

> **Title:** Consumer: total is ₦500 lower than the summary after payment
> **Role/screen:** Consumer / Order summary, then payment success
> **Steps:** 1. Sign in as consumer. 2. Suppliers, pick "TEST Gas Co". 3. 12.5 kg x 2. 4. Summary shows ₦X. 5. Pay with test card.
> **Expected:** success screen shows ₦X. **Actual:** shows ₦X-500.
> **Frequency:** every time. **Evidence:** recording attached.
> **Env:** Samsung A14, Android 14, v1.0.3, Wi-Fi. **Severity:** Critical

Good reports are specific. "Payment doesn't work" is not actionable; "Payment page stays white after tapping Pay with Payfonte, on mobile data" is.

## 8. Known limitations (do not report these)

- The consumer home screen uses a **demo device ID** and a **Simulate Drain** control; real sensor data is not connected yet. Usage history is empty until real readings exist.
- Vendors and riders can use the app while pending, but stay invisible to customers until approved. This is intended.
- Customers cannot cancel an order from the app.
- Push notifications depend on the build and device setup.
- Inbound email replies and some admin-side features are not part of the app.

## 9. Etiquette and data

- Use only test data and your own accounts. Do not enter anyone else's personal or banking details.
- Do not share the app build, your accounts or screenshots containing other people's information outside the test team.
- Do not try to break into other accounts or attack the system; stick to normal use of the app.
- Tell the coordinator straight away if you see real personal data you should not have access to (another person's phone number, email, order, address). That is a high-priority finding.

## 10. Daily routine (suggested)

1. Pick up the latest build and check the version.
2. Run your assigned cases and exploratory time.
3. Log results and file bugs.
4. Post a short summary in `<chat group>`: cases done, bugs filed, blockers.
5. Retest fixed bugs when the coordinator announces a new build.

Thank you for testing. Every bug found now is one a real customer never meets.
