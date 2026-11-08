import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { VEHICLE_OPTIONS, vehicleMatchOf, type TargetAppType } from '@onedal/shared';

/**
 * 🚚 **시뮬레이터가 그린 차종 글자를 정의 표로 맞추면 원래 차종이 나온다**.
 *
 * 시뮬레이터(onedal-sim)는 shared 를 안 읽고 차종 글자 표를 따로 둔다(인성 «오» · «1.4» · 화물24시 «1톤» · «승용»).
 * 그 표와 정의 표의 차종 낱말이 갈라지면 시뮬레이터 콜이 «차종 모름»으로 걸러진다 — 이 검사가 둘을 맞댄다.
 * 시뮬레이터의 표기 함수를 그대로 돌려 본다 — 그 파일만 타입 없이 옮겨 읽고, 시뮬레이터 공통 모듈은 빈 값으로 바꾼다(검사 기계에는 시뮬레이터 패키지가 깔리지 않는다).
 */
const SIM = join(__dirname, '../../../../onedal-sim/packages/ui-simulators/src');

function simFormatter(file: string, name: string): (vehicle: string) => string {
    const js = ts.transpileModule(readFileSync(join(SIM, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    new Function('exports', 'require', 'module', js)(mod.exports, () => ({}), mod);
    return mod.exports[name] as (vehicle: string) => string;
}

const SIM_NETWORKS: Array<[TargetAppType, string, string]> = [
    ['insung', 'insung/insungCall.ts', 'formatInsungVehicle'],
    ['hwamul24', 'hwamul24/hwamul24Call.ts', 'formatHwamul24Vehicle'],
];

describe.each(SIM_NETWORKS)('🚚 시뮬레이터 %s 차종 글자 → 정의 표', (network, file, name) => {
    const format = simFormatter(file, name);
    const matchOf = (vehicleText: string) => vehicleMatchOf({ vehicleText, sizeText: null, itemText: null, lines: [] }, network);

    it.each([...VEHICLE_OPTIONS])('우리 차종 %s 를 그린 글자는 그 차종으로 돌아온다', vehicle => {
        expect([format(vehicle), matchOf(format(vehicle))]).toEqual([format(vehicle), { kind: 'OURS', vehicle }]);
    });

    it.each(['14t', '18t'])('우리 차종이 없는 %s 를 그린 글자는 우리 차종이 되지 않는다', vehicle => {
        expect(matchOf(format(vehicle)).kind).not.toBe('OURS');
    });
});
