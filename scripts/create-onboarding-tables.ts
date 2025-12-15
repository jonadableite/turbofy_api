import { prisma } from '../src/infrastructure/database/prismaClient';
import * as fs from 'fs';
import * as path from 'path';

async function executeSqlFile() {
    try {
        // Log database info (masked)
        const dbUrl = process.env.DATABASE_URL || 'undefined';
        const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
        console.log(`🔌 Conectando ao banco: ${maskedUrl}`);

        console.log('📝 Lendo arquivo SQL...');
        const sqlFile = fs.readFileSync(
            path.join(__dirname, '../create_onboarding_tables.sql'),
            'utf8'
        );

        // Dividir o SQL em statements individuais
        const statements = sqlFile
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📊 Executando ${statements.length} statements SQL...`);

        for (const statement of statements) {
            if (statement.trim()) {
                console.log(`⚙️  Executando: ${statement.substring(0, 50)}...`);
                try {
                    await prisma.$executeRawUnsafe(statement);
                    console.log('   ✓ OK');
                } catch (err: any) {
                    // Ignorar erros de "já existe"
                    if (err.message?.includes('already exists') || err.code === '42P07') {
                        console.log('   ⚠️  Já existe, pulando...');
                    } else {
                        throw err;
                    }
                }
            }
        }

        console.log('\n✅ Tabelas criadas/verificadas com sucesso!');

        // Verificar se as tabelas foram criadas
        console.log('\n📋 Verificando tabelas...');
        const merchantProfiles = await prisma.$queryRaw`
      SELECT COUNT(*) FROM "MerchantProfile"
    `;
        console.log('✓ MerchantProfile:', merchantProfiles);

        const merchantDocuments = await prisma.$queryRaw`
      SELECT COUNT(*) FROM "MerchantDocument"
    `;
        console.log('✓ MerchantDocument:', merchantDocuments);

    } catch (error) {
        console.error('❌ Erro ao executar SQL:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

executeSqlFile()
    .then(() => {
        console.log('\n🎉 Migração concluída!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Falha na migração:', error);
        process.exit(1);
    });
