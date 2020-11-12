import * as GQL from 'graphql'
import stripAnsi from 'strip-ansi'
import * as Nexus from '@nexus/schema'
import * as SDK from '@prisma/sdk'
import * as NexusPrismaBuilder from '../src/builder'
import { DmmfDocument } from '../src/dmmf'
import {
  transform,
  TransformOptions
} from '../src/dmmf/transformer'
import { paginationStrategies } from '../src/pagination'
import { render as renderTypegen } from '../src/typegen'

const PrismaClientGenerator = require('@prisma/client/generator-build')

export const createNexusPrismaInternal = (
  options: Omit<NexusPrismaBuilder.InternalOptions, 'nexusBuilder'>
) =>
  Nexus.createPlugin({
    name: 'nexus-plugin-prisma-internal',
    onInstall: (nexusBuilder) => ({
      types: NexusPrismaBuilder.build({ ...options, nexusBuilder }).types,
    }),
  })

export async function getDmmf(datamodel: string, options?: TransformOptions) {
  const dmmf = await PrismaClientGenerator.getDMMF({
    datamodel,
  })
  return new DmmfDocument(transform(dmmf, options))
}

export async function getPinnedDmmfFromSchemaPath(datamodelPath: string) {
  return SDK.getDMMF({
    datamodelPath,
  })
}

export async function getPinnedDmmfFromSchema(datamodel: string) {
  return SDK.getDMMF({
    datamodel,
  })
}

export async function generateSchemaAndTypes(
  datamodel: string,
  types: any[],
  options?: TransformOptions & {
    experimentalCRUD?: boolean
    scalars?: Record<string, GQL.GraphQLScalarType>
    plugins?: Nexus.core.NexusPlugin[]
    paginationType?: 'relay' | 'prisma'
  }
) {
  const dmmf = await getDmmf(datamodel, options)
  const nexusPrisma = createNexusPrismaInternal({
    dmmf,
    experimentalCRUD: options?.experimentalCRUD === false ? false : true,
    scalars: options?.scalars,
    paginationStrategy: options?.paginationType ?? 'relay',
  })
  const schema = Nexus.makeSchema({
    types,
    plugins: [nexusPrisma, ...(options?.plugins ?? [])],
    outputs: false,
  })

  return {
    schemaString: GQL.printSchema(schema),
    schema,
    typegen: renderTypegen({
      dmmf,
      prismaClientImportId: '@prisma/client',
      paginationStrategy: options?.paginationStrategy ?? paginationStrategies.relay,
    }),
  }
}

export async function generateSchemaAndTypesWithoutThrowing(
  datamodel: string,
  types: any[],
  options?: TransformOptions
) {
  const dmmf = await getDmmf(datamodel, options)
  const nexusPrisma = new NexusPrismaBuilder.SchemaBuilder({
    nexusBuilder: {
      addType: () => false,
      hasType: () => false,
      getConfigOption: () => undefined,
      hasConfigOption: () => false,
      setConfigOption: () => false,
    },
    dmmf,
  }).build()
  const schemaAndMissingTypes = Nexus.core.makeSchemaInternal({
    types: [types, nexusPrisma],
    outputs: false,
  })
  const typegen = renderTypegen({
    dmmf,
    prismaClientImportId: '@prisma/client',
    paginationStrategy: paginationStrategies.relay,
  })

  return {
    schema: GQL.printSchema(schemaAndMissingTypes.schema),
    missingTypes: schemaAndMissingTypes.missingTypes,
    typegen,
  }
}

type UnPromisify<T> = T extends Promise<infer U> ? U : T

export async function mockConsoleLog<T extends (...args: any) => any>(
  func: T
): Promise<{ $output: string } & UnPromisify<ReturnType<T>>> {
  const oldLog = console.log
  let outputData = ''
  const storeLog = (inputs: string) => (outputData += '\n' + inputs)

  console.log = jest.fn(storeLog)
  const ret = await func()
  console.log = oldLog

  return {
    ...ret,
    $output: stripAnsi(outputData),
  }
}
