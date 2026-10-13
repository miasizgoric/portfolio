import { MossGround } from './MossGround'
import { ReedGrove } from './ReedGrove'
import { Sea } from './Sea'
import { SkyDome } from './SkyDome'
import { CloudLayer } from './CloudLayer'
import { Precipitation } from './Precipitation'
import type { World } from '@/world/useWorld'

export const FOREST_STAGES = 3

export function Forest({ stage, world }: { stage: number; world: World | null }) {
  return (
    <group>
      <SkyDome />
      {world && <MossGround world={world} />}
      {world && stage > 0 && <Sea world={world} />}
      {world && stage > 1 && <ReedGrove world={world} />}
      {stage > 2 && (
        <>
          {world && <CloudLayer world={world} />}
          <Precipitation />
        </>
      )}
    </group>
  )
}
