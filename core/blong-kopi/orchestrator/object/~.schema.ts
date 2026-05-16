import { validationHandlers } from '@feasibleone/blong'
import { Type, type Static } from 'typebox'

type $subject$ObjectPredicate = Static<typeof $subject$ObjectPredicate>
const $subject$ObjectPredicate = Type.Function(
  [
    Type.Object({
      $objectId: Type.String()
    })
  ],
  Type.Promise(
    Type.Object({
      $objectId: Type.String()
    })
  )
)

export default validationHandlers({
  $subject$ObjectPredicate
})

declare module '@feasibleone/blong' {
  interface ISchema {
    $subject$ObjectPredicate(
      params: Parameters<$subject$ObjectPredicate>[0],
      $meta: IMeta
    ): ReturnType<$subject$ObjectPredicate>
  }
}
