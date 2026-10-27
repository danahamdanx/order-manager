const DAY = 86_400_000;

export const DEMO_EMAIL_DOMAIN = 'demo.test';
export const DEMO_ADDRESS_PREFIX = '[demo] ';

export type Persona = 'gamer' | 'creator' | 'remote' | 'office';

export interface CatalogProduct {
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  icon: string;
  color: string;
}

export const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// أول 6 هم نفس منتجات الـ seed الأساسي (بنتخطاهم إذا موجودين). أسماء الصور بتتبع الاسم: monitor-24.jpg ...
export const DEMO_PRODUCTS: CatalogProduct[] = [
  { name: 'Wireless Keyboard', description: 'Slim, quiet keys with months of battery life.', category: 'Keyboards', price: 45.5, stock: 25, icon: 'keyboard', color: 'purple' },
  { name: 'USB-C Hub', description: 'Seven ports in one compact hub.', category: 'Accessories', price: 32, stock: 40, icon: 'usb', color: 'blue' },
  { name: 'Laptop Stand', description: 'Adjustable aluminum stand for better posture.', category: 'Accessories', price: 28.9, stock: 30, icon: 'device-laptop', color: 'amber' },
  { name: 'Monitor 24"', description: 'Full HD display with thin bezels.', category: 'Monitors', price: 160, stock: 12, icon: 'device-desktop', color: 'teal' },
  { name: 'Mechanical Mouse', description: 'Precise sensor and comfortable grip.', category: 'Accessories', price: 19.99, stock: 50, icon: 'mouse', color: 'coral' },
  { name: 'Webcam HD', description: '1080p webcam with a built-in microphone.', category: 'Accessories', price: 54, stock: 18, icon: 'camera', color: 'pink' },
  { name: 'Laptop Cooling Pad', description: 'Quiet dual-fan pad that keeps your laptop cool under load.', category: 'Accessories', price: 27.5, stock: 32, icon: 'device-laptop', color: 'teal' },
  { name: 'Laptop Charger 65W USB-C', description: 'Fast, compact USB-C charger for most modern laptops.', category: 'Accessories', price: 36, stock: 40, icon: 'plug', color: 'purple' },
  { name: 'Wireless Mouse', description: 'Silent clicks and a 2.4GHz receiver with long battery life.', category: 'Accessories', price: 17.9, stock: 55, icon: 'mouse', color: 'blue' },
  { name: 'Mechanical Keyboard TKL', description: 'Tenkeyless layout with tactile switches and RGB backlight.', category: 'Keyboards', price: 89, stock: 30, icon: 'keyboard', color: 'blue' },
  { name: 'Compact Bluetooth Keyboard', description: 'Pairs with three devices and fits in any bag.', category: 'Keyboards', price: 39.9, stock: 45, icon: 'keyboard', color: 'pink' },
  { name: 'Monitor 27" 4K', description: 'Sharp 4K panel with accurate colors for work and play.', category: 'Monitors', price: 329, stock: 14, icon: 'device-desktop', color: 'purple' },
  { name: 'Ultrawide Monitor 34"', description: 'Curved ultrawide screen that replaces two displays.', category: 'Monitors', price: 449, stock: 8, icon: 'device-desktop', color: 'teal' },
  { name: 'Mouse Pad XL', description: 'Extra-large stitched pad with a smooth surface.', category: 'Accessories', price: 14.5, stock: 60, icon: 'mouse', color: 'amber' },
  { name: 'Cable Organizer Kit', description: 'Clips and sleeves to keep your desk tidy.', category: 'Accessories', price: 9.99, stock: 80, icon: 'plug', color: 'coral' },
  { name: 'Docking Station Pro', description: 'One cable for two displays, power and all your ports.', category: 'Accessories', price: 119, stock: 20, icon: 'usb', color: 'blue' },
  { name: 'Studio Headphones', description: 'Closed-back headphones with detailed, balanced sound.', category: 'Audio', price: 129, stock: 25, icon: 'headphones', color: 'purple' },
  { name: 'USB Condenser Microphone', description: 'Clear voice recording for calls, streams and podcasts.', category: 'Audio', price: 79, stock: 22, icon: 'microphone', color: 'coral' },
  { name: 'Desk Speakers', description: 'Compact stereo speakers with rich bass.', category: 'Audio', price: 59, stock: 0, icon: 'headphones', color: 'amber' },
  { name: 'LED Desk Lamp', description: 'Adjustable brightness and color temperature.', category: 'Lighting', price: 34, stock: 35, icon: 'bulb', color: 'amber' },
  { name: 'Monitor Light Bar', description: 'Lights your desk without glare on the screen.', category: 'Lighting', price: 44, stock: 3, icon: 'bulb', color: 'teal' },
  { name: 'Monitor Arm', description: 'Gas-spring arm with full height and tilt adjustment.', category: 'Furniture', price: 69, stock: 18, icon: 'device-desktop', color: 'pink' },
  { name: 'Ergonomic Footrest', description: 'Adjustable footrest for better posture all day.', category: 'Furniture', price: 29, stock: 28, icon: 'package', color: 'coral' },
];

// كل نمط زبون بيشتري من مجموعة منتجات مختلفة (الرقم = الأهمية). هيك بتطلع توصيات مختلفة لكل زبون
export const PERSONA_POOLS: Record<Persona, readonly (readonly [string, number])[]> = {
  gamer: [['Mechanical Keyboard TKL', 5], ['Mechanical Mouse', 5], ['Mouse Pad XL', 4], ['Monitor 27" 4K', 3], ['Ultrawide Monitor 34"', 2], ['Studio Headphones', 3], ['Cable Organizer Kit', 1]],
  creator: [['USB Condenser Microphone', 5], ['Studio Headphones', 4], ['Webcam HD', 4], ['Monitor Light Bar', 3], ['Desk Speakers', 2], ['Monitor 27" 4K', 2], ['Docking Station Pro', 1]],
  remote: [['Laptop Stand', 5], ['USB-C Hub', 5], ['Docking Station Pro', 3], ['Webcam HD', 3], ['Wireless Keyboard', 3], ['Monitor 24"', 3], ['Studio Headphones', 2]],
  office: [['LED Desk Lamp', 4], ['Ergonomic Footrest', 4], ['Monitor Arm', 4], ['Monitor 24"', 3], ['Wireless Keyboard', 3], ['Compact Bluetooth Keyboard', 3], ['Cable Organizer Kit', 2], ['Mouse Pad XL', 2]],
};

// منتجات بتنباع سوا كثير: بتعطي إشارة "اللي اشترى هيك اشترى كمان" واضحة
export const BUNDLES: readonly (readonly string[])[] = [
  ['Mechanical Keyboard TKL', 'Mechanical Mouse'],
  ['Laptop Stand', 'USB-C Hub'],
  ['USB Condenser Microphone', 'Studio Headphones'],
  ['Monitor 24"', 'Monitor Arm'],
  ['LED Desk Lamp', 'Ergonomic Footrest'],
];

// حسابات موجودة بالـ seed الأساسي: بنضيف إلها طلبات بس
export const EXISTING_CUSTOMERS: readonly { email: string; name: string; persona: Persona; orders: number }[] = [
  { email: 'lina@example.com', name: 'Lina Haddad', persona: 'remote', orders: 4 },
  { email: 'omar@example.com', name: 'Omar Khalil', persona: 'gamer', orders: 3 },
];

export const FIRST_NAMES = ['Layla', 'Omar', 'Rania', 'Khaled', 'Sara', 'Yousef', 'Maya', 'Tariq', 'Nour', 'Hadi', 'Salma', 'Zaid', 'Lama', 'Karim', 'Huda', 'Fadi', 'Rasha', 'Samer', 'Dina', 'Majd', 'Aya', 'Bashar', 'Reem', 'Wael', 'Hala', 'Nabil', 'Mira', 'Adel', 'Jana', 'Ziad'];
export const LAST_NAMES = ['Haddad', 'Nasser', 'Khalil', 'Barakat', 'Odeh', 'Mansour', 'Saleh', 'Aziz', 'Qasem', 'Jaber', 'Shami', 'Darwish', 'Abbas', 'Faris', 'Hijazi', 'Masri', 'Natsheh', 'Rabah', 'Taha', 'Zahran', 'Issa', 'Kanaan', 'Sabbagh', 'Ghanem'];
export const STREETS = ['Rafidia St', 'Al-Quds St', 'Faisal St', 'Omar Al-Mukhtar St', 'Rainbow St', 'University St'];

export interface DemoCode {
  code: string;
  type: 'percent' | 'amount';
  value: number;
  from: Date | null; // ما بينستخدم الكود قبل هالتاريخ
  until: Date | null; // وما بينستخدم بعده (FLASH20 منتهي، فبيظهر "expired" بلوحة الأدمن)
  minSubtotal: number;
  firstOrderOnly: boolean;
  limit: number | null;
}

export const demoCodes = (now: Date): DemoCode[] => [
  { code: 'WELCOME10', type: 'percent', value: 10, from: null, until: null, minSubtotal: 0, firstOrderOnly: true, limit: 500 },
  { code: 'SAVE5', type: 'amount', value: 5, from: null, until: null, minSubtotal: 40, firstOrderOnly: false, limit: null },
  { code: 'FLASH20', type: 'percent', value: 20, from: new Date(now.getTime() - 46 * DAY), until: new Date(now.getTime() - 14 * DAY), minSubtotal: 0, firstOrderOnly: false, limit: 30 },
];