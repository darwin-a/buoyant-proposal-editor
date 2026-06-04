import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

// Real MECO team (from the proposals) + you. Roles map to our review workflow:
// COORDINATOR drafts/recycles · PRINCIPAL reviews + signs off · ENGINEER contributes.
const users = [
  { name: 'Sarah Mills', email: 'smills@mecoengineering.com', role: Role.COORDINATOR },
  { name: 'Donald Jenkins', email: 'djenkins@mecoengineering.com', role: Role.PRINCIPAL },
  { name: 'Scott Vogler', email: 'svogler@mecoengineering.com', role: Role.PRINCIPAL },
  { name: 'David Uhlig', email: 'duhlig@mecoengineering.com', role: Role.ENGINEER },
  { name: 'Kevin Garnett', email: 'kgarnett@mecoengineering.com', role: Role.ENGINEER },
  { name: 'Darwin Agunos', email: 'darwin@mecoengineering.com', role: Role.PRINCIPAL },
]

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: u,
    })
  }
  const all = await prisma.user.findMany({ orderBy: { email: 'asc' } })
  console.log(`Seeded ${users.length} users. Total in DB: ${all.length}`)
  for (const u of all) console.log(`  ${u.role.padEnd(11)} ${u.name.padEnd(16)} ${u.email}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
