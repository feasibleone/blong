import { validationHandlers } from '@feasibleone/blong'
import { Type, type Static } from 'typebox'

type cucumberCalculatorAdd = Static<typeof cucumberCalculatorAdd>
const cucumberCalculatorAdd = Type.Function(
  [
    Type.Object({
      a: Type.Number(),
      b: Type.Number()
    })
  ],
  Type.Promise(Type.Number())
)

type cucumberCalculatorSubtract = Static<typeof cucumberCalculatorSubtract>
const cucumberCalculatorSubtract = Type.Function(
  [
    Type.Object({
      a: Type.Number(),
      b: Type.Number()
    })
  ],
  Type.Promise(Type.Number())
)

export default validationHandlers({
  cucumberCalculatorAdd,
  cucumberCalculatorSubtract
})

declare module '@feasibleone/blong' {
  interface ISchema {
    cucumberCalculatorAdd(
      params: Parameters<cucumberCalculatorAdd>[0],
      $meta: IMeta
    ): ReturnType<cucumberCalculatorAdd>
    cucumberCalculatorSubtract(
      params: Parameters<cucumberCalculatorSubtract>[0],
      $meta: IMeta
    ): ReturnType<cucumberCalculatorSubtract>
  }
}
