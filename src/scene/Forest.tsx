import { MossGround } from './MossGround'
import { ReedGrove } from './ReedGrove'
import { Sea } from './Sea'
import { SkyDome } from './SkyDome'
import { CloudLayer } from './CloudLayer'
import { Precipitation } from './Precipitation'

export const FOREST_STAGES = 3

export function Forest({ stage }: { stage: number }) {
  return (
    <group>
      <SkyDome />
      <MossGround />
      {stage > 0 && <Sea />}
      {stage > 1 && <ReedGrove />}
      {stage > 2 && (
        <>
          <CloudLayer />
          <Precipitation />
        </>
      )}
    </group>
  )
}
