// Analysis-only prototype annotations, used in a read-only headless session.
// Explicit stack arguments/cleanup are established by the retained disassembly;
// names/types are analyst models, not recovered C++ declarations.
// @category Resa
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Function.FunctionUpdateType;
import ghidra.program.model.listing.Parameter;
import ghidra.program.model.listing.ParameterImpl;
import ghidra.program.model.data.DataType;
import ghidra.program.model.data.ByteDataType;
import ghidra.program.model.data.IntegerDataType;
import ghidra.program.model.data.UnsignedIntegerDataType;
import ghidra.program.model.data.VoidDataType;
import ghidra.program.model.data.PointerDataType;
import ghidra.program.model.symbol.SourceType;

public class TypeMouseTransport extends GhidraScript {
    private void signature(String address, String convention, DataType result, String[] names, DataType[] types, int purge) throws Exception {
        Function function = getFunctionAt(toAddr(address));
        if (function == null) throw new IllegalStateException("Missing function " + address);
        if (function.isThunk()) function = function.getThunkedFunction(true);
        function.setCallingConvention(convention);
        Parameter[] parameters = new Parameter[names.length];
        for (int i=0; i<names.length; i++) parameters[i] = new ParameterImpl(names[i], types[i], currentProgram);
        function.replaceParameters(FunctionUpdateType.DYNAMIC_STORAGE_ALL_PARAMS, true, SourceType.USER_DEFINED, parameters);
        function.setReturnType(result, SourceType.USER_DEFINED);
        function.setStackPurgeSize(purge);
        println("RESA_ANALYST_PROTOTYPE " + address + " " + function.getPrototypeString(true,true));
    }
    @Override
    public void run() throws Exception {
        if (!"0c57c57868ab44cdf1c65411a66abce78bec879482dc427ddde991eac5c39b19".equals(currentProgram.getExecutableSHA256())) throw new IllegalStateException("Wrong Program SHA256");
        DataType integer = IntegerDataType.dataType;
        DataType pointer = new PointerDataType(VoidDataType.dataType);
        DataType bytes = new PointerDataType(ByteDataType.dataType);
        for (String address : new String[]{"005c8fad","005c8fb3"}) {
            signature(address,"__stdcall",ByteDataType.dataType,new String[]{"handle","report","length"},new DataType[]{pointer,pointer,UnsignedIntegerDataType.dataType},12);
        }
        signature("00413850","__thiscall",VoidDataType.dataType,
            new String[]{"flag5","flag4","flag2","flag3","flag1","flag0","base","offset","last","value"},
            new DataType[]{integer,integer,integer,integer,integer,integer,integer,integer,integer,integer},40);
        for (String address : new String[]{"00413940","004139f0"}) {
            signature(address,"__thiscall",VoidDataType.dataType,new String[]{"base","data","count"},new DataType[]{integer,bytes,integer},12);
        }
        signature("00413ac0","__thiscall",VoidDataType.dataType,new String[]{"base","count"},new DataType[]{integer,integer},8);
    }
}
