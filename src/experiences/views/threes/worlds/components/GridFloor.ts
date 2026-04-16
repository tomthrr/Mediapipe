import ThreeActorBase from "../../bases/components/ThreeActorBase";
import { GridHelper } from "three";

export default class GridFloor extends ThreeActorBase {
    private static readonly _SCALE: number = 1000;

    declare private _grid: GridHelper;

    constructor() {
        super();

        this._generateFloor();
    }

    private _generateFloor(): void {
        this._grid = new GridHelper(100, 100);
        this.add(this._grid);
    }
}
